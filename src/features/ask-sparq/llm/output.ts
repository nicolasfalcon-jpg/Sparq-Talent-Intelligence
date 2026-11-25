import "server-only";
/**
 * The model's final answer: a strict JSON object, validated with Zod, post-checked against the product policy, and turned into the
 * app's AssistantAnswer. References are VALIDATED against what the tools actually returned in this request: an unknown id is dropped,
 * and the evidence line shown for a person always comes from tool data, never from model text.
 */
import { z } from "zod";
import { assessModelOutput } from "@/domain/talent-policy";
import type { AssistantAction, AssistantAnswer, AssistantRef } from "../content";
import type { Seen } from "./tools";

export const ModelAnswer = z.object({
  answer: z.string().trim().min(1).max(900),
  bullets: z.array(z.string().trim().min(1).max(260)).max(6).default([]),
  refs: z.array(z.object({ kind: z.enum(["person", "opportunity", "evidence"]), id: z.string().trim().min(1).max(80) }).strict()).max(8).default([]),
}).strict();
export type ModelAnswer = z.infer<typeof ModelAnswer>;

/** JSON Schema for `output_config.format` (the API guarantees the shape; Zod re-validates and adds length limits). */
export const ANSWER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "bullets", "refs"],
  properties: {
    answer: { type: "string" },
    bullets: { type: "array", items: { type: "string" } },
    refs: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["kind", "id"], properties: { kind: { type: "string", enum: ["person", "opportunity", "evidence"] }, id: { type: "string" } } },
    },
  },
} as const;

export type OutputFailure = "not_json" | "invalid_shape" | "policy";
export type OutputResult = { ok: true; answer: ModelAnswer } | { ok: false; reason: OutputFailure };

export function parseModelAnswer(text: string): OutputResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, reason: "not_json" }; }
  const parsed = ModelAnswer.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid_shape" };
  if (!assessModelOutput([parsed.data.answer, ...parsed.data.bullets]).ok) return { ok: false, reason: "policy" };
  return { ok: true, answer: parsed.data };
}

/** Build the app answer. Unknown refs are dropped (never shown); person details come from tool data. */
export function toAssistantAnswer(question: string, out: ModelAnswer, seen: Seen, model: string, opts: { ownPersonId?: string | null } = {}): AssistantAnswer {
  const personIds: string[] = [];
  const actions: AssistantAction[] = [];
  for (const r of out.refs) {
    if (r.kind === "person" && seen.people.has(r.id)) personIds.push(r.id);
    else if (r.kind === "evidence" && seen.evidence.has(r.id)) personIds.push(seen.evidence.get(r.id) as string);
    else if (r.kind === "opportunity" && seen.opportunities.has(r.id) && actions.length < 3) {
      actions.push({ label: `Open ${seen.opportunities.get(r.id)!.label}`, href: `/opportunities?open=${encodeURIComponent(r.id)}`, variant: "soft" });
    }
  }
  const refs: AssistantRef[] = [...new Set(personIds)].filter((id) => seen.people.has(id)).slice(0, 5).map((id) => {
    const p = seen.people.get(id)!;
    return { personId: id, name: p.name, href: opts.ownPersonId === id ? "/me/passport" : `/people/${id}`, evidence: p.evidence ?? "Documented profile", ...(p.when ? { when: p.when, whenTone: p.whenTone } : {}) };
  });
  return { question, answer: out.answer, bullets: out.bullets, refs, actions, provenance: "ai", model };
}
