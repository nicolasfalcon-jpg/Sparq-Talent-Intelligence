import "server-only";
import { getRepositories } from "@/data/repositories";
import { scopedTalent } from "@/data/repositories/scoped";
import { assertAllowed } from "@/domain/policy";
import type { AppUser } from "@/domain/schemas";
import { buildMe, type MeModel } from "./model";

export type MeView = MeModel & {
  /** Owner only: every interest label with its selected flag, and which selected ones are shared with staffing. */
  interestsAll: Record<string, boolean>;
  interestsShared: string[];
  /** "Free from Jan 5 · confirmed" for the interest dialog */
  availabilityText: string;
};

/**
 * My Space. AUTHORIZED: engineers only, about their OWN person (the id comes from the session, never from the URL).
 * Published opportunities are the ones OPEN for interest. The engineer sees roles and requirements but never who is proposed,
 * and never the delivery lead (the database does not let an engineer read them either).
 */
export async function getMeView(viewer: AppUser): Promise<MeView | null> {
  assertAllowed(viewer, "workspace:personal");
  assertAllowed(viewer, "opportunities:read-published");
  if (!viewer.personId) return null;
  const repos = getRepositories();
  const talent = scopedTalent(repos, viewer);
  const today = repos.clock.today();
  const agg = await talent.getPerson(viewer.personId); // asserts passport:read: own passport only
  if (!agg) return null;
  const [catalogue, interests, projects, assignments, opportunities, eois] = await Promise.all([
    talent.listCapabilities(), talent.getInterests(viewer.personId), talent.listProjects(viewer.personId),
    repos.planning.listAssignments(viewer), repos.opportunities.list(), repos.interests.listForPerson(viewer.personId),
  ]);
  // Published = open for interest. Strip what an engineer must not see: proposals and the delivery lead.
  const published = opportunities.filter((o) => o.status === "Open").map((o) => ({ ...o, deliveryLead: "", deliveryLeadId: null, roles: o.roles.map((r) => ({ ...r, proposedPersonId: null })) }));
  const ownSelected = Object.entries(interests.all).filter(([, on]) => on).map(([k]) => k);
  const model = buildMe({ person: agg.person, evidence: agg.evidence, availability: agg.availability, assignments, projectCount: projects.length, ownInterests: ownSelected, published, known: opportunities, eois, catalogue, today });
  const av = agg.availability;
  const availabilityText = av.availableFrom <= today ? "Free now" : `From ${new Date(`${av.availableFrom}T00:00:00Z`).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} · ${av.status}`;
  return { ...model, interestsAll: interests.all, interestsShared: interests.shared, availabilityText };
}
