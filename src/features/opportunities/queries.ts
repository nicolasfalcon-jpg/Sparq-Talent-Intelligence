import "server-only";
import { getRepositories } from "@/data/repositories";
import { scopedTalent } from "@/data/repositories/scoped";
import { assertAllowed } from "@/domain/policy";
import type { AppUser, Opportunity } from "@/domain/schemas";

/**
 * Opportunities and the names of proposed people. AUTHORIZED: staffing workspace only for now (proposals are staffing
 * decisions about people; the engineer-facing "open opportunities" view arrives with My Space and will strip proposals).
 */
export async function getOpportunitiesData(viewer: AppUser): Promise<{ all: Opportunity[]; nameOf: (personId: string) => string }> {
  assertAllowed(viewer, "opportunities:read");
  const repos = getRepositories();
  const [all, people] = await Promise.all([repos.opportunities.list(), scopedTalent(repos, viewer).listPeople()]);
  return { all, nameOf: (id) => people.find((p) => p.person.id === id)?.person.name ?? id };
}
