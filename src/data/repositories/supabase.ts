import "server-only";
import { createRequestClient } from "@/lib/supabase/server";
import type { Repositories } from "./types";
import type { Db } from "./supabase/db";
import { createRepositoriesWith } from "./supabase/index";

/**
 * Supabase adapter (SPARQ_DATA_SOURCE=supabase). A singleton OBJECT, never a singleton connection: every method asks
 * `createRequestClient()` for the caller's own client at call time, so row-level security and the SQL functions always run as the
 * signed-in user. There is no service-role path here. See docs/handoff/10-supabase-adapter.md.
 */
export function createSupabaseRepositories(getClient: () => Promise<unknown> = createRequestClient): Repositories {
  return createRepositoriesWith(async () => (await getClient()) as Db);
}
