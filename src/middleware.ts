/**
 * DEMO ONLY. Gives a browser that opens a page without a demo persona the default one (staffing lead), so the fictional
 * demo "just opens". It is the replacement for the old hidden default role: the session helper itself never defaults.
 *
 * - Page navigations only (GET). API calls and server-action POSTs are never given a session here: an anonymous
 *   `/api/assistant` request gets 401, an anonymous action gets a typed "no session" error.
 * - The cookie is unsigned and client-settable: it is NOT authentication (see src/lib/demo-identity.ts).
 */
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_DEMO_PERSONA, DEMO_COOKIE_OPTIONS, PERSONA_COOKIE, parseDemoPersona } from "@/lib/demo-identity";

export function middleware(request: NextRequest) {
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
