/**
 * DEMO IDENTITY — NOT AUTHENTICATION. Pure constants shared by the session helper and the middleware.
 *
 * The persona cookie is an unsigned, client-settable value that lets a developer explore the two fictional workspaces
 * (staffing lead "Laura Gómez", engineer "Ana Ruiz"). It proves nothing about who is calling, so it must never be
 * presented, documented or deployed as production authentication. It exists only for local fictional data and is the
 * single seam real authentication replaces: swap the body of `getSession()` in session.ts (and delete this file,
 * src/middleware.ts and /persona) without touching the authorization policy, which only ever sees an `Actor`.
 */
import type { UserRole } from "@/domain/schemas";

export const PERSONA_COOKIE = "sparq_demo_persona";
export const DEMO_PERSONAS: readonly UserRole[] = ["staffing_lead", "engineer"];
export const DEFAULT_DEMO_PERSONA: UserRole = "staffing_lead";

export function parseDemoPersona(value: string | undefined | null): UserRole | null {
  return (DEMO_PERSONAS as readonly string[]).includes(value ?? "") ? (value as UserRole) : null;
}

export const DEMO_COOKIE_OPTIONS = { path: "/", sameSite: "lax" as const, httpOnly: true };
