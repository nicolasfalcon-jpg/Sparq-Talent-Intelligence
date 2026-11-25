/**
 * Request gate. Two modes (see src/lib/data-source.ts):
 *
 *  - memory (local fictional data only): DEMO persona handoff. Gives a browser that opens a PAGE without a persona the default
 *    one (staffing lead). Page navigations only (GET): API calls and server-action POSTs never get a session for free. The
 *    cookie is unsigned and client-settable: it is NOT authentication.
 *  - supabase: refreshes the Supabase Auth session cookie and sends unauthenticated page navigations to /login.
 *    Implemented in src/lib/supabase/middleware.ts.
 */
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_DEMO_PERSONA, DEMO_COOKIE_OPTIONS, PERSONA_COOKIE, parseDemoPersona } from "@/lib/demo-identity";
import { dataSource } from "@/lib/data-source";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  if (dataSource() === "supabase") return updateSupabaseSession(request);
  if (request.method !== "GET" || parseDemoPersona(request.cookies.get(PERSONA_COOKIE)?.value)) return NextResponse.next();
  // Make the cookie visible to this very request (Server Components read request cookies), and persist it on the response.
  request.cookies.set(PERSONA_COOKIE, DEFAULT_DEMO_PERSONA);
  const headers = new Headers(request.headers);
  headers.set("cookie", request.cookies.toString());
  const response = NextResponse.next({ request: { headers } });
  response.cookies.set(PERSONA_COOKIE, DEFAULT_DEMO_PERSONA, DEMO_COOKIE_OPTIONS);
  return response;
}

export const config = {
  // Pages only: not the API, framework assets, static art, or the persona switch (which sets its own cookie).
  matcher: ["/((?!api|_next|portraits|persona|icon.svg|favicon.ico).*)"],
};
