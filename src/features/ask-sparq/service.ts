import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getRepositories } from "@/data/repositories";
import type { AssistantRequest } from "@/domain/schemas";
import { dataSource } from "@/lib/data-source";
import { resolveAssistantRequest } from "./access";
import type { AssistantAnswer } from "./content";
import type { AssistantActor, AssistantGateway } from "./contract";
import { RuleBasedAssistant } from "./gateway";
import { ClaudeAssistant, type MessagesClient } from "./llm/claude";
import { assistantEffort, assistantModel, claudeEnabled, dailyLimit, LIMITS } from "./llm/config";
import { memoryLimiter, SupabaseUsageLimiter, type RpcClient, type UsageLimiter } from "./llm/limiter";

export { AssistantQuotaError } from "./llm/limiter";

function defaultLimiter(): UsageLimiter {
  if (dataSource() === "supabase") {
    // Loaded lazily so memory mode never needs Supabase. Request-scoped client: the function counts for auth.uid().
    return new SupabaseUsageLimiter(async () => (await import("@/lib/supabase/server")).createRequestClient() as unknown as RpcClient);
  }
  return memoryLimiter();
}

function defaultClient(): MessagesClient {
  // The key is read here, server-side only. maxRetries is bounded; the per-answer budget is enforced by the gateway's AbortSignal.
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: LIMITS.maxRetries, timeout: LIMITS.totalMs }) as unknown as MessagesClient;
}

/**
 * Composition root for the assistant. With ANTHROPIC_API_KEY set (and SPARQ_ASSISTANT_PROVIDER not "rules") the Claude gateway
 * answers, wrapping the deterministic gateway as its fallback; otherwise the deterministic gateway answers alone. Both sit behind
 * the same user-aware contract and the same request resolution, so the route and its authorization do not change.
 */
export function getAssistant(): AssistantGateway {
  const repos = getRepositories();
  const rules = new RuleBasedAssistant(repos);
  if (!claudeEnabled()) return rules;
  return new ClaudeAssistant(repos, { client: defaultClient(), model: assistantModel(), effort: assistantEffort(), limit: dailyLimit(), limiter: defaultLimiter(), fallback: rules });
}

/** Authorize and resolve the untrusted request, then answer it for this user. Throws typed errors (Forbidden, NotFound, InvalidRequest, AssistantQuota). */
export async function answerAssistantRequest(actor: AssistantActor, raw: AssistantRequest): Promise<AssistantAnswer> {
  const resolved = await resolveAssistantRequest(getRepositories(), actor, raw);
  return getAssistant().answer(resolved, actor);
}
