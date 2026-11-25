import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/features/auth/redirect";
import { supabaseEnv } from "./env";

/** Paths an unauthenticated visitor may open. Everything else that is a PAGE NAVIGATION requires a session. */
const PUBLIC_PATHS = ["/login", "/logout"];

export type AccessDecision = { kind: "next" } | { kind: "redirect"; to: string };

/**
 * Pure access rule of the gate (unit-tested):
 *  - only GET page navigations are ever redirected. API routes and server-action POSTs answer 401 / a typed error themselves;
 *  - /login and /logout are always reachable; a signed-in visitor opening /login goes to Home (which routes by role);
 *  - an anonymous page navigation goes to /login, remembering a SAFE same-origin `next`.
 */
export function decideAccess(input: { method: string; pathname: string; search: string; authenticated: boolean }): AccessDecision {
  const { method, pathname, search, authenticated } = input;
  if (method !== "GET") return { kind: "next" };
  if (pathname.startsWith("/api")) return { kind: "next" };
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPublic) return authenticated && pathname === "/login" ? { kind: "redirect", to: "/" } : { kind: "next" };
  if (authenticated) return { kind: "next" };
  const next = safeNextPath(pathname + search);
  return { kind: "redirect", to: next && next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login" };
}

/**
 * Supabase Auth session gate (src/middleware.ts, supabase mode). Validates the session with the Auth server (`getUser`, never
 * the unverified cookie), writes refreshed tokens back to the request and the response, then applies `decideAccess`.
 */
export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  const { url, anonKey } = supabaseEnv();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(items) {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of items) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const decision = decideAccess({ method: request.method, pathname: request.nextUrl.pathname, search: request.nextUrl.search, authenticated: !!data?.user });
  if (decision.kind === "next") return response;
  const redirect = NextResponse.redirect(new URL(decision.to, request.url));
  for (const c of response.cookies.getAll()) redirect.cookies.set(c);
  return redirect;
}
