import "server-only";
import { getRepositories } from "@/data/repositories";
import { scopedTalent } from "@/data/repositories/scoped";
import { assertAllowed } from "@/domain/policy";
import type { AppUser, Assignment, Opportunity, TeamProposal } from "@/domain/schemas";

export type OpportunitiesData = {
  all: Opportunity[];
  nameOf: (personId: string) => string;
  /** Proposals the viewer may see (staffing leads: non-drafts and their own drafts; delivery leads: non-drafts of their opportunities). */
  proposals: TeamProposal[];
  /** Assignments the viewer may see (what is confirmed). */
  assignments: Assignment[];
};

/**
 * Opportunities and the names of proposed people. AUTHORIZED: staffing leads see every opportunity; a delivery lead only the
 * ones they lead (the database does the same through row-level security). Engineers have their own published view in My Space.
 */
export async function getOpportunitiesData(viewer: AppUser): Promise<OpportunitiesData> {
  assertAllowed(viewer, "opportunities:read");
  const repos = getRepositories();
  const [list, proposals, assignments] = await Promise.all([repos.opportunities.list(), repos.proposals.list(viewer), repos.planning.listAssignments(viewer)]);
  const all = viewer.role === "delivery_lead" ? list.filter((o) => o.deliveryLeadId === viewer.id) : list;
  // Names: staffing leads read the directory; a delivery lead only reaches people through proposals they can see.
  const names = new Map<string, string>();
  if (viewer.role === "staffing_lead") for (const a of await scopedTalent(repos, viewer).listPeople()) names.set(a.person.id, a.person.name);
  else {
    const ids = [...new Set([...proposals.flatMap((p) => p.seats.map((s) => s.personId)), ...assignments.map((a) => a.personId)].filter((x): x is string => !!x))];
    for (const id of ids) { const a = await repos.talent.getPerson(id); if (a) names.set(id, a.person.name); }
  }
  return { all, nameOf: (id) => names.get(id) ?? id, proposals, assignments };
}
