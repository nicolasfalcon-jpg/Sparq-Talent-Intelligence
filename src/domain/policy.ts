/**
 * Application authorization policy. Pure: no React, no I/O, no cookies.
 *
 * ONE place decides who may do what. Queries, the scoped data layer (src/data/repositories/scoped.ts), server actions,
 * the assistant gateway and the assistant route all call `authorize` / `assertAllowed`; presentation components never
 * re-implement these rules (they only render what the server already selected).
 *
 * The actor comes from the session: Supabase Auth in production, the DEMO persona cookie only in memory mode (see
 * src/lib/session.ts). Changing where the actor comes from never changes these rules.
 */
import type { AssistantContext, AppUser, UserRole } from "./schemas";
import { ForbiddenError } from "./errors";

export type Actor = Pick<AppUser, "id" | "role" | "personId">;

export type Permission =
  | "workspace:staff" // the shared application shell: staffing leads and delivery leads
  | "workspace:personal" // the person's own space
  | "workspace:admin" // administration landing page
  | "people:list" // browse and search the people directory (availability, evidence of everyone)
  | "passport:read" // read one Talent Passport (resource.personId)
  | "passport:edit" // owner-only mutations of a passport (resource.personId)
  | "interests:read-private" // a person's private career goals / learning interests (resource.personId)
  | "shortlist:edit"
  | "opportunities:read" // opportunities and their roles (the database further limits a delivery lead to the ones they lead)
  | "opportunities:read-published" // an engineer reads opportunities that are open for interest (no proposals, no people)
  | "proposals:read" // proposals visible to the viewer (the database scopes them)
  | "proposals:write" // compose, save, submit and withdraw proposals (Fill a Role, Build a Team)
  | "proposals:review" // approve, decline or return a proposal (the database also requires leading that opportunity)
  | "assignments:confirm" // confirm a seat of an approved proposal as a real assignment (leading that opportunity)
  | "planning:read" // resource planning and compare (read-only)
  | "insights:read" // aggregate supply and demand
  | "interest:express" // raise a hand for a role (resource.personId = the owner)
  | "assistant:ask";

export type Resource = { personId?: string | null };
export type Decision = { allowed: true } | { allowed: false; reason: string };

const ALLOW: Decision = { allowed: true };
const deny = (reason: string): Decision => ({ allowed: false, reason });

const isOwner = (actor: Actor, resource: Resource): boolean => !!actor.personId && !!resource.personId && actor.personId === resource.personId;
const only = (actor: Actor, roles: readonly UserRole[], reason: string): Decision => (roles.includes(actor.role) ? ALLOW : deny(reason));

/**
 * A role alone is only the first gate. The database adds the relationship (leading THIS opportunity, being assigned to THIS
 * person, owning THIS profile) through row-level security and the SQL functions; the memory adapter reproduces it for tests.
 */
export function authorize(actor: Actor, permission: Permission, resource: Resource = {}): Decision {
  switch (permission) {
    case "workspace:staff":
      return only(actor, ["staffing_lead", "delivery_lead"], "This area is only available in the staffing workspace.");
    case "workspace:personal":
      return only(actor, ["engineer"], "This area is only available in a personal space.");
    case "workspace:admin":
      return only(actor, ["admin"], "This area is only available to administrators.");
    case "people:list":
    case "shortlist:edit":
    case "proposals:write":
    case "planning:read":
    case "insights:read":
      return only(actor, ["staffing_lead"], "This area is only available to staffing leads.");
    case "opportunities:read":
    case "proposals:read":
      return only(actor, ["staffing_lead", "delivery_lead"], "This area is only available in the staffing workspace.");
    case "opportunities:read-published":
      return only(actor, ["engineer"], "Published opportunities are shown in a personal space.");
    case "proposals:review":
    case "assignments:confirm":
      return only(actor, ["delivery_lead"], "Only a delivery lead can review proposals and confirm assignments.");
    case "passport:read":
      // Staffing leads read every passport (through the privacy filter, see scoped.ts); people read only their own.
      // Delivery leads reach a passport only through the database's working-relationship rule, not through this policy.
      if (actor.role === "staffing_lead") return ALLOW;
      return actor.role === "engineer" && isOwner(actor, resource) ? ALLOW : deny("You can only open your own passport.");
    case "passport:edit":
      // Owner-only. Staffing leads can never edit someone else's passport.
      return actor.role === "engineer" && isOwner(actor, resource) ? ALLOW : deny("Only the owner of this passport can change it.");
    case "interests:read-private":
      // Even staffing leads: private goals and interests belong to the person.
      return actor.role === "engineer" && isOwner(actor, resource) ? ALLOW : deny("These interests are private to their owner.");
    case "interest:express":
      return actor.role === "engineer" && isOwner(actor, resource) ? ALLOW : deny("You can only share your own interest.");
    case "assistant:ask":
      return actor.role === "admin" ? deny("Ask Sparq is not available to administrators.") : ALLOW;
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
  delivery_lead: [],
  admin: [],
};

export function canUseAssistantContext(actor: Actor, context: AssistantContext): boolean {
  return ASSISTANT_CONTEXTS[actor.role].includes(context);
}
