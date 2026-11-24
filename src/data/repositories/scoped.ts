/**
 * Actor-scoped data access: the boundary where AUTHORIZATION and PRIVACY are applied to data selection.
 *
 * Queries and the assistant gateway read people data only through `scopedTalent(repos, actor)`. Every method asserts
 * the policy in src/domain/policy.ts (throwing a typed `ForbiddenError`) and shapes what it returns for that actor, so
 * private data is never selected for a view that must not show it. Hiding something in JSX is not enough: whatever is
 * passed to a client component ends up in the page payload.
 *
 * Privacy rules enforced here:
 *  - private career goals and learning interests are returned in full only to their owner; everyone else gets the
 *    labels the owner voluntarily shared (and not even the count of what is private);
 *  - professional preferences (`workPreferences`) are returned to others only when `workPreferencesShared` is true.
 */
import { assertAllowed, authorize, type Actor } from "@/domain/policy";
import type { Person } from "@/domain/schemas";
import type { PersonAggregate, Repositories } from "./types";

export type InterestsView = {
  isOwner: boolean;
  /** Owner only: every selected-or-not interest label. Empty for everyone else. */
  all: Record<string, boolean>;
  /** Labels visible to this actor. Owner: all selected. Others: only the shared ones. */
  visible: string[];
  /** Owner only: which of their selected interests are currently shared with staffing. */
  shared: string[];
};

/** A copy of the aggregate with fields the actor may not see removed. Never mutates the store's objects. */
function redact(actor: Actor, agg: PersonAggregate): PersonAggregate {
  if (authorize(actor, "interests:read-private", { personId: agg.person.id }).allowed) return agg;
  if (agg.person.workPreferencesShared) return agg;
  const person: Person = { ...agg.person };
  delete person.workPreferences; // a copy: the stored profile is untouched
  return { ...agg, person };
}

export function scopedTalent(repos: Repositories, actor: Actor) {
  return {
    /** The skills catalogue is shared reference data. */
    listCapabilities: () => repos.talent.listCapabilities(),

    async listPeople(): Promise<PersonAggregate[]> {
      assertAllowed(actor, "people:list");
      return (await repos.talent.listPeople()).map((a) => redact(actor, a));
    },

    async getPerson(personId: string): Promise<PersonAggregate | null> {
      assertAllowed(actor, "passport:read", { personId });
      const agg = await repos.talent.getPerson(personId);
      return agg ? redact(actor, agg) : null;
    },

    async listProjects(personId: string) {
      assertAllowed(actor, "passport:read", { personId });
      return repos.talent.listProjects(personId);
    },

    async getInterests(personId: string): Promise<InterestsView> {
      assertAllowed(actor, "passport:read", { personId });
      if (authorize(actor, "interests:read-private", { personId }).allowed) {
        const own = await repos.talent.getCareerInterests(personId);
        const all = own?.interests ?? {};
        return { isOwner: true, all, visible: Object.entries(all).filter(([, on]) => on).map(([k]) => k), shared: own ? own.shared.filter((l) => all[l]) : [] };
      }
      return { isOwner: false, all: {}, visible: await repos.talent.getSharedInterests(personId), shared: [] };
    },
  };
}

export type ScopedTalent = ReturnType<typeof scopedTalent>;
