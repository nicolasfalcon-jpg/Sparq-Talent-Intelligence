import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRepositories } from "@/data/repositories";
import { ForbiddenError, UnauthenticatedError } from "@/domain/errors";
import type { AppUser, UserRole } from "@/domain/schemas";
import { PERSONA_COOKIE, parseDemoPersona } from "./demo-identity";

/**
 * SESSION — the one place server code asks "who is calling?".
 *
 * Today the answer comes from the DEMO persona cookie (see demo-identity.ts): it is not authentication and offers no
 * security. It is strict on purpose: no cookie, or an invalid value, means NO session. There is no implicit default
 * role, so routes and actions that require a session really require one. (`src/middleware.ts` hands a demo cookie to
 * browser page navigations so the demo opens as the staffing lead; API and action requests never get one for free.)
 *
 * What is AUTHORIZED is decided elsewhere, by the policy in src/domain/policy.ts, from the user returned here.
 * Real authentication (phase 2B.2+) replaces only `getSession()`.
 */
export { ForbiddenError, UnauthenticatedError };
export { PERSONA_COOKIE };

/** The signed-in user, or null when there is no valid session. Never throws, never defaults. */
export async function getSession(): Promise<AppUser | null> {
  const jar = await cookies();
  const role = parseDemoPersona(jar.get(PERSONA_COOKIE)?.value);
  return role ? getRepositories().directory.getUserByRole(role) : null;
}

/** For API routes and server actions: a session is required, otherwise a typed UnauthenticatedError. */
export async function requireSession(): Promise<AppUser> {
  const user = await getSession();
  if (!user) throw new UnauthenticatedError();
  return user;
}

/** For pages and layouts: no session sends the visitor to the demo sign-in instead of guessing a role. */
export async function getSessionUser(): Promise<AppUser> {
  const user = await getSession();
  if (!user) redirect("/persona?as=staffing_lead");
  return user;
}

/** Server-side role check used by server actions. Throws a typed ForbiddenError / UnauthenticatedError. */
export async function requireRole(role: UserRole): Promise<AppUser> {
  const user = await requireSession();
  if (user.role !== role) throw new ForbiddenError();
  return user;
}
