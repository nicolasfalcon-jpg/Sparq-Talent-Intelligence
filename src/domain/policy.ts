/**
 * Application authorization policy. Pure: no React, no I/O, no cookies.
 *
 * ONE place decides who may do what. Queries, the scoped data layer (src/data/repositories/scoped.ts), server actions,
 * the assistant gateway and the assistant route all call `authorize` / `assertAllowed`; presentation components never
 * re-implement these rules (they only render what the server already selected).
 *
 * The actor comes from the session. Today the session is the DEMO persona cookie (see src/lib/session.ts), which is
 * not authentication. Replacing it with real authentication changes where the actor comes from, not these rules.
 */
import type { AssistantContext, AppUser, UserRole } from "./schemas";
import { ForbiddenError } from "./errors";

export type Actor = Pick<AppUser, "id" | "role" | "personId">;

export type Permission =
  | "workspace:staff" // staffing workspace (Home, People, Opportunities, Planning, Insights…)
  | "workspace:personal" // the person's own space
  | "people:list" // browse and search the people directory (availability, evidence of everyone)
  | "passport:read" // read one Talent Passport (resource.personId)
  | "passport:edit" // owner-only mutations of a passport (resource.personId)
  | "interests:read-private" // a person's private career goals / learning interests (resource.personId)
  | "shortlist:edit"
  | "opportunities:read"
  | "assistant:ask";

export type Resource = { personId?: string | null };
export type Decision = { allowed: true } | { allowed: false; reason: string };

const ALLOW: Decision = { allowed: true };
const deny = (reason: string): Decision => ({ allowed: false, reason });

const isOwner = (actor: Actor, resource: Resource): boolean => !!actor.personId && !!resource.personId && actor.personId === resource.personId;

export function authorize(actor: Actor, permission: Permission, resource: Resource = {}): Decision {
  switch (permission) {
    case "workspace:staff":
    case "people:list":
    case "shortlist:edit":
    case "opportunities:read":
      return actor.role === "staffing_lead" ? ALLOW : deny("This area is only available in the staffing workspace.");
    case "workspace:personal":
      return actor.role === "engineer" ? ALLOW : deny("This area is only available in a personal space.");
    case "passport:read":
      // Staffing leads read every passport (through the privacy filter, see scoped.ts); people read only their own.
      if (actor.role === "staffing_lead") return ALLOW;
      return isOwner(actor, resource) ? ALLOW : deny("You can only open your own passport.");
    case "passport:edit":
      // Owner-only. Staffing leads can never edit someone else's passport.
      return actor.role === "engineer" && isOwner(actor, resource) ? ALLOW : deny("Only the owner of this passport can change it.");
    case "interests:read-private":
      // Even staffing leads: private goals and interests belong to the person.
      return isOwner(actor, resource) ? ALLOW : deny("These interests are private to their owner.");
    case "assistant:ask":
      return ALLOW;
  }
}

export function assertAllowed(actor: Actor, permission: Permission, resource: Resource = {}): void {
  const d = authorize(actor, permission, resource);
  if (!d.allowed) throw new ForbiddenError(d.reason);
}

/* ---------------- Ask Sparq contexts ---------------- */

/**
 * Which assistant contexts each role may use. The client names a context, but the server decides whether this user
 * may use it: a context is not a permission and can never widen what the user can read.
 */
export const ASSISTANT_CONTEXTS: Record<UserRole, readonly AssistantContext[]> = {
  staffing_lead: ["home", "people", "passport", "opps", "role", "team", "planning", "insights", "compare"],
  engineer: ["me", "mypassport"],
};

export function canUseAssistantContext(actor: Actor, context: AssistantContext): boolean {
  return ASSISTANT_CONTEXTS[actor.role].includes(context);
}
