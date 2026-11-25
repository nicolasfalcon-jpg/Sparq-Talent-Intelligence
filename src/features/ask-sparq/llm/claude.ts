import "server-only";
/**
 * ClaudeAssistant: the real model behind the existing AssistantGateway contract.
 *
 *   policy pre-check (deterministic) → usage limit → bounded tool loop (read-only, as the actor) → strict JSON answer →
 *   Zod + product post-check → validated refs → provenance "ai".
 * ANY failure (error, timeout, refusal, invalid or policy-violating output, unavailable counter) returns the deterministic
 * RuleBasedAssistant answer labelled "fallback" with an honest note. A refusal is NEVER retried on another model: there is no
 * `fallbacks` parameter and no second model anywhere in this file.
 *
 * Bounds: 25 s total budget (an AbortSignal shared by every request), at most 4 rounds of tool use, max_tokens 2000, one SDK retry.
 * Model facts (Sonnet 5.5): no forced tool_choice (tools use the default `auto`), thinking is left at its adaptive default, no
 * assistant prefill, no sampling parameters; depth is controlled by `output_config.effort`.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { scopedTalent } from "@/data/repositories/scoped";
import type { Repositories } from "@/data/repositories";
import { authorize } from "@/domain/policy";
import { assessTalentRequest } from "@/domain/talent-policy";
import type { AssistantAnswer } from "../content";
import type { AssistantActor, AssistantGateway, ResolvedAssistantRequest } from "../contract";
import { LIMITS, type AssistantEffort } from "./config";
import { AssistantQuotaError, type UsageLimiter } from "./limiter";
import { ANSWER_JSON_SCHEMA, parseModelAnswer, toAssistantAnswer } from "./output";
import { buildUserMessage, SYSTEM_PROMPT } from "./prompt";
import { executeTool, newSeen, toolsFor, type ToolEnv } from "./tools";

/** The only part of the Anthropic client this gateway uses (tests inject a fake). */
export interface MessagesClient {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming, options?: { signal?: AbortSignal; timeout?: number }): Promise<Anthropic.Message> };
}

export type ClaudeDeps = {
  client: MessagesClient;
  model: string;
  effort: AssistantEffort;
  limit: number;
  limiter: UsageLimiter;
  /** The deterministic gateway used for declined requests and for every failure. */
  fallback: AssistantGateway;
  now?: () => number;
};

type FailureKind = "refusal" | "timeout" | "error" | "invalid" | "policy" | "unmetered";
class ModelFailure extends Error {
  constructor(readonly kind: FailureKind, detail = "") { super(`${kind}${detail ? `: ${detail}` : ""}`); }
}

const NOTICE: Record<FailureKind, string> = {
  refusal: "The model declined this request, so this is a deterministic answer instead.",
  timeout: "Sparq Intelligence took too long, so this is a deterministic answer computed without a model.",
  error: "Sparq Intelligence is unavailable right now, so this is a deterministic answer computed without a model.",
  invalid: "The model’s answer could not be used, so this is a deterministic answer computed without a model.",
  policy: "The model’s answer did not pass the product checks (no scores or rankings of people), so this is a deterministic answer instead.",
  unmetered: "Usage could not be checked right now, so this is a deterministic answer computed without a model.",
};

export class ClaudeAssistant implements AssistantGateway {
  constructor(private readonly repos: Repositories, private readonly deps: ClaudeDeps) {}

  async answer(req: ResolvedAssistantRequest, actor: AssistantActor): Promise<AssistantAnswer> {
    // 1) Responsible-use policy BEFORE any model: a declined request never reaches Claude and costs nothing.
    if (!req.promptId) {
      const names = authorize(actor, "people:list").allowed ? (await scopedTalent(this.repos, actor).listPeople()).map((r) => r.person.name) : [];
      if (!assessTalentRequest(req.question, names).allowed) return this.deps.fallback.answer(req, actor);
    }
    // 2) No tools for this actor (delivery leads, admins): nothing for a model to read, so nothing to generate.
    if (toolsFor(actor).length === 0) return this.deps.fallback.answer(req, actor);
    // 3) Per-user limit, counted BEFORE the call.
    const outcome = await this.deps.limiter.consume(actor.id, this.deps.limit);
    if (outcome === "exhausted") throw new AssistantQuotaError();
    if (outcome === "unavailable") return this.fallbackAnswer(req, actor, "unmetered");
    try {
      return await this.generate(req, actor);
    } catch (e) {
      const kind: FailureKind = e instanceof ModelFailure ? e.kind : /timeout|abort/i.test(`${(e as Error)?.name} ${(e as Error)?.message}`) ? "timeout" : "error";
      // Never log prompts, tool data or credentials: only the failure kind and the SDK status.
      console.error("[assistant] model path failed", kind, (e as { status?: number })?.status ?? "");
      return this.fallbackAnswer(req, actor, kind);
    }
  }

  private async fallbackAnswer(req: ResolvedAssistantRequest, actor: AssistantActor, kind: FailureKind): Promise<AssistantAnswer> {
    const a = await this.deps.fallback.answer(req, actor);
    return { ...a, provenance: "fallback", notice: NOTICE[kind] };
  }

  private async generate(req: ResolvedAssistantRequest, actor: AssistantActor): Promise<AssistantAnswer> {
    const { client, model, effort } = this.deps;
    const now = this.deps.now ?? Date.now;
    const env: ToolEnv = { repos: this.repos, actor, talent: scopedTalent(this.repos, actor), today: this.repos.clock.today(), seen: newSeen() };
    const tools = toolsFor(actor).map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema, strict: true as const }));
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildUserMessage(req, actor) }];
    const deadline = now() + LIMITS.totalMs;
    let rounds = 0;

    for (;;) {
      const remaining = deadline - now();
      if (remaining <= 0) throw new ModelFailure("timeout");
      const res = await client.messages.create({
        model, max_tokens: LIMITS.maxTokens, system: SYSTEM_PROMPT, messages, tools,
        output_config: { effort, format: { type: "json_schema", schema: ANSWER_JSON_SCHEMA as unknown as Record<string, unknown> } },
      }, { timeout: remaining, signal: AbortSignal.timeout(remaining) });

      if (res.stop_reason === "refusal") throw new ModelFailure("refusal");
      if (res.stop_reason === "end_turn") {
        const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
        const parsed = parseModelAnswer(text);
        if (!parsed.ok) throw new ModelFailure(parsed.reason === "policy" ? "policy" : "invalid", parsed.reason);
        return toAssistantAnswer(req.question, parsed.answer, env.seen, res.model ?? model, { ownPersonId: actor.personId });
      }
      if (res.stop_reason !== "tool_use" && res.stop_reason !== "pause_turn") throw new ModelFailure("invalid", `stop_reason ${res.stop_reason}`);

      rounds += 1;
      if (rounds > LIMITS.maxToolRounds) throw new ModelFailure("invalid", "too many tool rounds");
      messages.push({ role: "assistant", content: res.content as unknown as Anthropic.ContentBlockParam[] });
      if (res.stop_reason === "tool_use") {
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const block of res.content) {
          if (block.type !== "tool_use") continue;
          const r = await executeTool(env, block.name, block.input);
          results.push({ type: "tool_result", tool_use_id: block.id, content: r.content, ...(r.ok ? {} : { is_error: true }) });
        }
        messages.push({ role: "user", content: results });
      }
    }
  }
}
