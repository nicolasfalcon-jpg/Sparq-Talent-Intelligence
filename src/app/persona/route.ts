import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_DEMO_PERSONA, DEMO_COOKIE_OPTIONS, PERSONA_COOKIE, parseDemoPersona } from "@/lib/demo-identity";
import { demoPersonaEnabled } from "@/lib/data-source";
import { homeFor } from "@/lib/access";

/**
 * DEMO-ONLY persona switch used by the account menu in memory mode.
 * This is NOT authentication: anyone can call it and become any persona. It exists only for local fictional data, and it
 * does not exist (404) when the application runs on Supabase or in a deployed environment (see src/lib/data-source.ts).
 */
export function GET(request: NextRequest) {
  if (!demoPersonaEnabled()) return new NextResponse("Not found", { status: 404 });
  const as = parseDemoPersona(request.nextUrl.searchParams.get("as")) ?? DEFAULT_DEMO_PERSONA;
  const res = NextResponse.redirect(new URL(homeFor({ role: as }), request.url));
  res.cookies.set(PERSONA_COOKIE, as, DEMO_COOKIE_OPTIONS);
  return res;
}
