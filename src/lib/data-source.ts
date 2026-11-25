/**
 * Where the application's data and identity come from. Pure (no React, no I/O) so the middleware can use it too.
 *
 *  - "memory": fictional in-process fixtures + the DEMO persona cookie. Local development and isolated tests ONLY.
 *  - "supabase": Supabase PostgreSQL and Auth (real sessions, request-scoped user JWT, row-level security).
 *
 * A deployed environment (Vercel, or SPARQ_DEPLOYED=1) REFUSES memory mode and the persona cookie: they are not authentication
 * and not persistence. There is no override: set SPARQ_DATA_SOURCE=supabase.
 */
export type DataSource = "memory" | "supabase";

export const isDeployed = (): boolean => !!process.env.VERCEL || process.env.SPARQ_DEPLOYED === "1";

export function dataSource(): DataSource {
  const raw = process.env.SPARQ_DATA_SOURCE ?? "memory";
  if (raw !== "memory" && raw !== "supabase") throw new Error(`SPARQ_DATA_SOURCE must be "memory" or "supabase" (got "${raw}").`);
  if (raw === "memory" && isDeployed()) {
    throw new Error("Refusing to start: the memory adapter and the demo persona are not allowed in a deployed environment. Set SPARQ_DATA_SOURCE=supabase.");
  }
  return raw;
}

export const isSupabaseMode = (): boolean => dataSource() === "supabase";
/** The demo persona cookie exists only in memory mode. */
export const demoPersonaEnabled = (): boolean => dataSource() === "memory";
