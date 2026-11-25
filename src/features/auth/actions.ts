"use server";
import { redirect } from "next/navigation";
import { loadCurrentUser } from "@/data/repositories/supabase/directory";
import type { Db } from "@/data/repositories/supabase/db";
import { homeFor } from "@/lib/access";
import { isSupabaseMode } from "@/lib/data-source";
import { createRequestClient } from "@/lib/supabase/server";
import { safeNextPath } from "./redirect";
import { NO_ROLE_ERROR, SIGN_IN_ERROR, SIGN_IN_MISSING, SignInInput, type SignInState } from "./schema";

/**
 * Email + password sign-in (controlled demo accounts; there is no registration, no password reset and no SSO).
 * One generic message for every failure of the credentials, so the form never reveals whether an email exists. Rate limiting and
 * lockout belong to Supabase Auth. On success the visitor goes to their role's home (or a safe same-origin `next`).
 */
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (!isSupabaseMode()) return { error: "Sign-in is not available in this mode." };
  const parsed = SignInInput.safeParse({ email: formData.get("email"), password: formData.get("password"), next: formData.get("next") ?? undefined });
  if (!parsed.success) return { error: SIGN_IN_MISSING };
  const supabase = await createRequestClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) return { error: SIGN_IN_ERROR };
  // Same loader as the session: the role comes from the database, never from the token.
  const user = await loadCurrentUser(supabase as unknown as Db);
  if (!user) { await supabase.auth.signOut(); return { error: NO_ROLE_ERROR }; }
  redirect(safeNextPath(parsed.data.next) ?? homeFor(user));
}
