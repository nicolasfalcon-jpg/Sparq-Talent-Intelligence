import "server-only";
/**
 * Per-user usage limit for model calls. A call is counted BEFORE the model is contacted, so a user over the limit costs nothing.
 *  - memory mode: a per-process counter per user per UTC day (resettable in tests);
 *  - Supabase mode: the audited SQL function `consume_assistant_quota(p_limit)`, which counts for auth.uid() atomically.
 * Outcomes: "ok" (call allowed), "exhausted" (limit reached → HTTP 429), "unavailable" (could not be counted → no model call; the
 * deterministic answer is used instead, so a broken counter can never mean unlimited spend).
 */
export type QuotaOutcome = "ok" | "exhausted" | "unavailable";

export interface UsageLimiter {
  consume(userId: string, limit: number): Promise<QuotaOutcome>;
}

/** Thrown by the gateway when the user's daily limit is reached. The route turns it into 429; no model call was made. */
export class AssistantQuotaError extends Error {
  constructor(message = "You’ve reached today’s Ask Sparq limit. It resets tomorrow; the deterministic suggestions still work.") {
    super(message);
    this.name = "AssistantQuotaError";
  }
}

const utcDay = (now = new Date()): string => now.toISOString().slice(0, 10);

export class MemoryUsageLimiter implements UsageLimiter {
  private counts = new Map<string, number>();
  constructor(private readonly now: () => Date = () => new Date()) {}
  async consume(userId: string, limit: number): Promise<QuotaOutcome> {
    const key = `${userId}:${utcDay(this.now())}`;
    const used = this.counts.get(key) ?? 0;
    if (used >= limit) return "exhausted";
    this.counts.set(key, used + 1);
    return "ok";
  }
  reset(): void { this.counts.clear(); }
}

/** The part of a Supabase client the limiter needs (kept narrow so tests inject a fake and memory mode never loads Supabase). */
export type RpcClient = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };

export class SupabaseUsageLimiter implements UsageLimiter {
  constructor(private readonly getClient: () => Promise<RpcClient>) {}
  async consume(_userId: string, limit: number): Promise<QuotaOutcome> {
    try {
      const client = await this.getClient(); // request-scoped: the caller's JWT, so the function counts for auth.uid()
      const { data, error } = await client.rpc("consume_assistant_quota", { p_limit: limit });
      if (error) return "unavailable";
      return data === true ? "ok" : data === false ? "exhausted" : "unavailable";
    } catch {
      return "unavailable";
    }
  }
}

const g = globalThis as unknown as { __sparqMemoryUsage?: MemoryUsageLimiter };
export function memoryLimiter(): MemoryUsageLimiter {
  g.__sparqMemoryUsage ??= new MemoryUsageLimiter();
  return g.__sparqMemoryUsage;
}
/** Test helper. */
export function resetUsage(): void { memoryLimiter().reset(); }
