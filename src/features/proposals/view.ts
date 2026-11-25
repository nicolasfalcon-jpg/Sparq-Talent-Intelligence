/**
 * Presentation model of a proposal for the review screens (pure: no I/O, usable on server and client).
 * Everything shown is derived from documented evidence, availability and the pure rules in domain/proposals.ts.
 * No score, rank or percentage about a person is computed.
 */
import type { PersonAggregate } from "@/data/repositories/types";
import { formatShortDate } from "@/domain/dates";
import { teamCoverage, resolveCapability, seatFit, type SeatFit, type TeamCoverage } from "@/domain/proposals";
import { bestEvidence, describeEvidence } from "@/domain/rules";
import type { Capability, Opportunity, ProposalSeat, TeamProposal } from "@/domain/schemas";

export type SeatView = {
  seat: ProposalSeat;
  person: { id: string; name: string; headline: string } | null;
  fit: SeatFit | null;
  evidence: { label: string; text: string; level: string | null; needsConfirmation: boolean }[];
};
export type ProposalView = {
  proposal: TeamProposal;
  opportunity: { id: string; client: string; name: string; kickoff: string; durationMonths: number; lead: string } | null;
  seats: SeatView[];
  coverage: TeamCoverage;
  /** "To confirm during review" notes (spec §9.7). Information for the reviewer, never a verdict about a person. */
  notes: string[];
};

export function buildProposalView(p: TeamProposal, opportunities: Opportunity[], people: Record<string, PersonAggregate>, capabilities: Capability[], today: string): ProposalView {
  const opp = opportunities.find((o) => o.id === p.opportunityId) ?? null;
  const seats: SeatView[] = p.seats.map((seat) => {
    const agg = seat.personId ? people[seat.personId] : undefined;
    const evidence = seat.capabilities.map((label) => {
      const cap = resolveCapability(label, capabilities);
      const best = agg && cap ? bestEvidence(agg.evidence, cap.id) : null;
      const d = describeEvidence(best?.level ?? null, best?.verification ?? null);
      return { label, text: d.text, level: best?.level ?? null, needsConfirmation: d.needsConfirmation };
    });
    return {
      seat, person: agg ? { id: agg.person.id, name: agg.person.name, headline: agg.person.headline } : null,
      fit: agg && opp ? seatFit(agg.availability, opp.kickoff, opp.id, today) : null, evidence,
    };
  });
  const evidenceByPerson = Object.fromEntries(Object.values(people).map((a) => [a.person.id, a.evidence]));
  const coverage = teamCoverage(p.seats, evidenceByPerson, capabilities);
  const notes: string[] = [];
  for (const s of seats) {
    if (!s.person) notes.push(`${s.seat.title} seat is still open`);
    else if (s.fit?.conflict) notes.push(`${s.person.name}: ${s.fit.text}`);
  }
  if (coverage.notDocumented.length) notes.push(`Not documented on this team: ${coverage.notDocumented.join(", ")}`);
  if (coverage.trainingOrIndependent.length) notes.push(`Training or independent work only: ${coverage.trainingOrIndependent.join(", ")}`);
  if (opp && notes.length === 0) notes.push(`Nothing pending before kick-off on ${formatShortDate(opp.kickoff)}`);
  return {
    proposal: p, notes, seats, coverage,
    opportunity: opp ? { id: opp.id, client: opp.client, name: opp.name, kickoff: opp.kickoff, durationMonths: opp.durationMonths, lead: opp.deliveryLead } : null,
  };
}
