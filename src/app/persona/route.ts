import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_DEMO_PERSONA, DEMO_COOKIE_OPTIONS, PERSONA_COOKIE, parseDemoPersona } from "@/lib/demo-identity";

/**
 * DEMO-ONLY persona switch used by the account menu ("Staffing" / "My space").
 * This is NOT authentication: anyone can call it and become either persona. It exists only for local fictional data
 * and is removed when real authentication arrives (see src/lib/demo-identity.ts).
 */
export function GET(request: NextRequest) {
  const as = parseDemoPersona(request.nextUrl.searchParams.get("as")) ?? DEFAULT_DEMO_PERSONA;
  const res = NextResponse.redirect(new URL(as === "engineer" ? "/me" : "/", request.url));
  res.cookies.set(PERSONA_COOKIE, as, DEMO_COOKIE_OPTIONS);
  return res;
}
