import "server-only";
/**
 * Proposal queries (server view-models). Every query takes the viewer, authorizes with the central policy and reads people
 * only through `scopedTalent`, or, for a delivery lead (who has no directory access), only the people who appear in the proposals
 * the viewer may see (the database's "working relationship" rule).
 *
 * SHAPES (workstream F4 builds the Build a Team canvas against exactly these):
 *
 *  getProposalWorkbench(viewer, { opportunityId?, proposalId? }) → ProposalWorkbench      [staffing leads only: proposals:write]
 *    {
 *      today: string;                         // business "today" (YYYY-MM-DD)
 *      opportunities: Opportunity[];          // every opportunity (live: roles carry proposedPersonId)
 *      opportunity: Opportunity | null;       // from proposalId's opportunity, else opportunityId, else null
 *      reviewerName: string | null;           // the opportunity's delivery lead = the real reviewer
 *      capabilities: Capability[];            // the skills catalogue
 *      candidates: PersonAggregate[];         // {person, evidence, availability} the lead may see (privacy-filtered, availability derived)
 *      shortlist: string[];                   // person ids on the viewer's shortlist
 *      sharedInterests: ExpressionOfInterest[]; // SHARED expressions of interest (for the "Shared interest" badge)
 *      proposal: TeamProposal | null;         // the requested proposal if the viewer may see it
 *      myDrafts: TeamProposal[];              // the viewer's own draft / changes_requested proposals
 *    }
 *
 *  getReviewInbox(viewer) → ReviewInbox                                                    [proposals:read: staffing + delivery leads]
 *    {
 *      today: string;
 *      proposals: TeamProposal[];             // visible to the viewer (delivery lead: non-drafts of the opportunities they lead)
 *      opportunities: Opportunity[];          // the opportunities those proposals belong to (and, for staff, all of them)
 *      people: Record<string, PersonAggregate>; // everyone who appears in a visible proposal (evidence + derived availability)
 *      capabilities: Capability[];
 *      assignments: Assignment[];             // assignments the viewer may see (to show what is already confirmed)
 *      canReview: boolean;                    // the viewer is a delivery lead
 *    }
 */
import { getRepositories } from "@/data/repositories";
import { scopedTalent } from "@/data/repositories/scoped";
import type { PersonAggregate } from "@/data/repositories/types";
import { assertAllowed } from "@/domain/policy";
import type { AppUser, Assignment, Capability, ExpressionOfInterest, Opportunity, TeamProposal } from "@/domain/schemas";

export type ProposalWorkbench = {
  today: string;
  opportunities: Opportunity[];
  opportunity: Opportunity | null;
  reviewerName: string | null;
  capabilities: Capability[];
  candidates: PersonAggregate[];
  shortlist: string[];
  sharedInterests: ExpressionOfInterest[];
  proposal: TeamProposal | null;
  myDrafts: TeamProposal[];
};

export type ReviewInbox = {
  today: string;
  proposals: TeamProposal[];
  opportunities: Opportunity[];
  people: Record<string, PersonAggregate>;
  capabilities: Capability[];
  assignments: Assignment[];
  canReview: boolean;
};

export async function getProposalWorkbench(viewer: AppUser, opts: { opportunityId?: string; proposalId?: string } = {}): Promise<ProposalWorkbench> {
  assertAllowed(viewer, "proposals:write");
  const repos = getRepositories();
  const talent = scopedTalent(repos, viewer);
  const [opportunities, capabilities, candidates, shortlist, sharedInterests, visible] = await Promise.all([
    repos.opportunities.list(), talent.listCapabilities(), talent.listPeople(), repos.shortlists.get(viewer.id), repos.interests.listSharedFor(viewer), repos.proposals.list(viewer),
  ]);
  const proposal = opts.proposalId ? (visible.find((p) => p.id === opts.proposalId) ?? null) : null;
  const opportunity = opportunities.find((o) => o.id === (proposal?.opportunityId ?? opts.opportunityId)) ?? null;
  return {
    today: repos.clock.today(), opportunities, opportunity, reviewerName: opportunity?.deliveryLead || null, capabilities, candidates, shortlist, sharedInterests, proposal,
    myDrafts: visible.filter((p) => p.createdBy === viewer.id && (p.state === "draft" || p.state === "changes_requested")),
  };
}

/** Privacy-filtered aggregate for a person a delivery lead reaches through a proposal: no preferences unless shared. */
function forReviewer(agg: PersonAggregate): PersonAggregate {
  if (agg.person.workPreferencesShared) return agg;
  const person = { ...agg.person };
  delete person.workPreferences;
  return { ...agg, person };
}

export async function getReviewInbox(viewer: AppUser): Promise<ReviewInbox> {
  assertAllowed(viewer, "proposals:read");
  const repos = getRepositories();
  const [proposals, allOpportunities, capabilities, assignments] = await Promise.all([
    repos.proposals.list(viewer), repos.opportunities.list(), repos.talent.listCapabilities(), repos.planning.listAssignments(viewer),
  ]);
  const opportunities = viewer.role === "delivery_lead" ? allOpportunities.filter((o) => o.deliveryLeadId === viewer.id) : allOpportunities;
  const ids = [...new Set(proposals.flatMap((p) => p.seats.map((s) => s.personId)).filter((x): x is string => !!x))];
  const aggs = viewer.role === "staffing_lead"
    ? (await scopedTalent(repos, viewer).listPeople()).filter((a) => ids.includes(a.person.id))
    : (await Promise.all(ids.map((id) => repos.talent.getPerson(id)))).filter((a): a is PersonAggregate => !!a).map(forReviewer);
  return {
    today: repos.clock.today(), proposals, opportunities, people: Object.fromEntries(aggs.map((a) => [a.person.id, a])), capabilities, assignments, canReview: viewer.role === "delivery_lead",
  };
}
