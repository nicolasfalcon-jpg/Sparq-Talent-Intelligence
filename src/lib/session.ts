import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRepositories } from "@/data/repositories";
import { ForbiddenError, UnauthenticatedError } from "@/domain/errors";
import type { AppUser, UserRole } from "@/domain/schemas";
import { PERSONA_COOKIE, parseDemoPersona } from "./demo-identity";
import { dataSource } from "./data-source";

/**
 * SESSION — the one place server code asks "who is calling?".
 *
 *  - Supabase mode: the user of the request's Supabase Auth session (verified with the Auth server, never trusted from a
 *    cookie alone), with the role read from the database (`user_roles`), never from a token claim.
 *  - Memory mode (local fictional data and isolated tests only): the DEMO persona cookie (see demo-identity.ts). It is not
 *    authentication and offers no security; a deployed environment refuses it (data-source.ts).
 *
 * Strict in both modes: no valid session means NO session. There is no implicit default role, so routes and actions that
 * require a session really require one. What is AUTHORIZED is decided elsewhere, by the policy in src/domain/policy.ts
 * (and, in Supabase mode, by row-level security), from the user returned here.
 */
export { ForbiddenError, UnauthenticatedError };
export { PERSONA_COOKIE };

/** The signed-in user, or null when there is no valid session. Never throws for a missing session, never defaults. */
export async function getSession(): Promise<AppUser | null> {
  if (dataSource() === "supabase") return getRepositories().directory.getCurrentUser();
  const jar = await cookies();
  const role: UserRole | null = parseDemoPersona(jar.get(PERSONA_COOKIE)?.value);
  return role ? getRepositories().directory.getUserByRole(role) : null;
}

/** For API routes and server actions: a session is required, otherwise a typed UnauthenticatedError. */
export async function requireSession(): Promise<AppUser> {
  const user = await getSession();
  if (!user) throw new UnauthenticatedError();
  return user;
}

/** For pages and layouts: no session sends the visitor to sign in instead of guessing a role. */
export async function getSessionUser(): Promise<AppUser> {
  const user = await getSession();
  if (!user) redirect(dataSource() === "supabase" ? "/login" : "/persona?as=staffing_lead");
  return user;
}

/** Server-side role check used by server actions. Throws a typed ForbiddenError / UnauthenticatedError. */
export async function requireRole(role: UserRole): Promise<AppUser> {
  const user = await requireSession();
  if (user.role !== role) throw new ForbiddenError();
  return user;
}
