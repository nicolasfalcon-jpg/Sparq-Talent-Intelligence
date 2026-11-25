import "server-only";
/**
 * Sparq Intelligence configuration. Server-only: nothing here may reach the browser (the API key lives in ANTHROPIC_API_KEY).
 *
 *  ANTHROPIC_API_KEY            enables the Claude gateway. Absent → the deterministic RuleBasedAssistant answers.
 *  SPARQ_ASSISTANT_PROVIDER     "rules" forces the deterministic gateway even when a key is present.
 *  SPARQ_ASSISTANT_MODEL        model id (default claude-sonnet-5-5).
 *  SPARQ_ASSISTANT_EFFORT       low | medium | high (default low: this is a short interactive answer).
 *  SPARQ_ASSISTANT_DAILY_LIMIT  model calls per user per UTC day (default 40, 1..1000).
 */
/** Anything shaped like process.env (so tests can pass a plain object). */
type Env = Record<string, string | undefined>;

export const DEFAULT_MODEL = "claude-sonnet-5-5";
/** Hard bounds of one answer. */
export const LIMITS = { totalMs: 25_000, maxToolRounds: 4, maxTokens: 2_000, maxRetries: 1 } as const;

export type AssistantEffort = "low" | "medium" | "high";

export function assistantModel(env: Env = process.env): string {
  return env.SPARQ_ASSISTANT_MODEL?.trim() || DEFAULT_MODEL;
}

export function assistantEffort(env: Env = process.env): AssistantEffort {
  const v = env.SPARQ_ASSISTANT_EFFORT?.trim();
  return v === "medium" || v === "high" ? v : "low";
}

export function dailyLimit(env: Env = process.env): number {
  const n = Number.parseInt(env.SPARQ_ASSISTANT_DAILY_LIMIT ?? "", 10);
  return Number.isFinite(n) && n >= 1 && n <= 1000 ? n : 40;
}

export function claudeEnabled(env: Env = process.env): boolean {
  return !!env.ANTHROPIC_API_KEY?.trim() && env.SPARQ_ASSISTANT_PROVIDER?.trim() !== "rules";
}
