import "server-only";
import { getProposalWorkbench } from "@/features/proposals/queries";
import type { AppUser } from "@/domain/schemas";
import type { DraftLink } from "./DescribeStage";
import type { TeamBuilderProps } from "./TeamBuilder";

/**
 * Server view-model for Build a Team. Reads through F3's `getProposalWorkbench` (authorized: proposals:write, people only through
 * the scoped talent layer) and keeps the client payload minimal: people are reduced to id, name, discipline, headline, availability
 * and evidence. Nothing private (preferences, interests) is ever serialized to the page.
 */
export async function getTeamBuilderProps(viewer: AppUser, opts: { opportunityId?: string; proposalId?: string }): Promise<Omit<TeamBuilderProps, "actions">> {
  const w = await getProposalWorkbench(viewer, opts);
  const opportunities = w.opportunities.map((o) => ({
    id: o.id, client: o.client, clientInitials: o.clientInitials, industry: o.industry, name: o.name, description: o.description, kickoff: o.kickoff,
    durationMonths: o.durationMonths, deliveryLead: o.deliveryLead, deliveryLeadId: o.deliveryLeadId, roles: o.roles,
  }));
  const nameOf = Object.fromEntries(w.opportunities.map((o) => [o.id, o.client]));
  const drafts: DraftLink[] = w.myDrafts.map((d) => ({ id: d.id, title: d.title, opportunityName: (d.opportunityId && nameOf[d.opportunityId]) || "", state: d.state }));
  return {
    base: {
      today: w.today, catalogue: w.capabilities, shortlist: w.shortlist, opportunityNames: nameOf,
      interests: w.sharedInterests.map((i) => ({ personId: i.personId, roleRequirementId: i.roleRequirementId, opportunityId: i.opportunityId })),
      candidates: w.candidates.map((a) => ({ personId: a.person.id, name: a.person.name, discipline: a.person.discipline, headline: a.person.headline, availability: a.availability, evidence: a.evidence })),
    },
    opportunities,
    initialOpportunityId: w.opportunity?.id ?? null,
    proposal: w.proposal,
    drafts,
  };
}
