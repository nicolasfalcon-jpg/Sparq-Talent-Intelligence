import { NextResponse, type NextRequest } from "next/server";
import { PERSONA_COOKIE } from "@/lib/session";

/**
 * DEMO-ONLY persona switch used by the account menu ("Staffing" / "My space").
 * This is NOT authentication. Phase 2 removes this route in favour of Supabase Auth.
 */
export function GET(request: NextRequest) {
  const as = request.nextUrl.searchParams.get("as") === "engineer" ? "engineer" : "staffing_lead";
  const res = NextResponse.redirect(new URL(as === "engineer" ? "/me" : "/", request.url));
  res.cookies.set(PERSONA_COOKIE, as, { path: "/", sameSite: "lax", httpOnly: true });
  return res;
}
