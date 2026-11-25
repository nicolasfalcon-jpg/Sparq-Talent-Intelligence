import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/**
 * The ONLY way application code obtains a database/Auth client: a REQUEST-SCOPED client that carries the caller's own session
 * (their JWT, from the request cookies). Row-level security and the SQL functions are therefore evaluated as that user.
 *
 *  - Uses the public URL and the anon (publishable) key ONLY. The service-role key and database URL never enter the application
 *    runtime (a unit test greps `src/` for them). There is no privileged client and no way to build one here.
 *  - No module-level client and no shared token. Within one request the same client is reused (keyed by that request's cookie
 *    store in a WeakMap, so it can never outlive the request or leak to another one); every other request gets its own.
 */
const perRequest = new WeakMap<object, SupabaseClient>();

export async function createRequestClient(): Promise<SupabaseClient> {
  const jar = await cookies();
  const existing = perRequest.get(jar);
  if (existing) return existing;
  const { url, anonKey } = supabaseEnv();
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(items) {
        // Server Components cannot write cookies: the middleware refreshes the session there. Actions and route handlers can.
        try { for (const { name, value, options } of items) jar.set(name, value, options); } catch { /* read-only context */ }
      },
    },
  });
  perRequest.set(jar, client);
  return client;
}
