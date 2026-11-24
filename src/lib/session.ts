import "server-only";
import { cookies } from "next/headers";
import { getRepositories } from "@/data/repositories";
import type { AppUser, UserRole } from "@/domain/schemas";

/**
 * DEMO SESSION — not authentication.
 * The active persona (Staffing Lead "Laura Gómez" or Engineer "Ana Ruiz") is a plain cookie so the
 * two workspaces of the approved design can be explored. Phase 2 replaces this with Supabase Auth
 * (`@supabase/ssr`) and role claims; every caller already goes through `getSessionUser()`.
 */
export const PERSONA_COOKIE = "sparq_demo_persona";

export async function getSessionUser(): Promise<AppUser> {
  const jar = await cookies();
  const raw = jar.get(PERSONA_COOKIE)?.value;
  const role: UserRole = raw === "engineer" ? "engineer" : "staffing_lead";
  return getRepositories().directory.getUserByRole(role);
}

/** Thrown by `requireRole`. Server actions turn it into a typed `{ ok: false }` result instead of letting it escape. */
export class ForbiddenError extends Error {
  constructor(message = "Not allowed for the current persona") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Server-side authorisation helper for server actions. */
export async function requireRole(role: UserRole): Promise<AppUser> {
  const user = await getSessionUser();
  if (user.role !== role) throw new ForbiddenError();
  return user;
}
