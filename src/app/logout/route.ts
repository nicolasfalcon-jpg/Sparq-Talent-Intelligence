import { NextResponse, type NextRequest } from "next/server";
import { createRequestClient } from "@/lib/supabase/server";
import { isSupabaseMode } from "@/lib/data-source";

/** POST /logout: ends the Supabase session (clears its cookies) and returns to /login. POST only, so a link or image cannot sign anyone out. */
export async function POST(request: NextRequest) {
  if (isSupabaseMode()) await (await createRequestClient()).auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
