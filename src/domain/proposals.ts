/**
 * Pure business rules for proposals, seats, coverage, availability fit and allocation capacity. No React, no I/O.
 *
 * Shared by the memory adapter (which reproduces the SQL rules for tests), the server queries/actions and the UI, so the
 * canvas, the review screen and the database agree. The database is still the enforcement in Supabase mode
 * (supabase/migrations/0006: proposal_guard, assignment_capacity_guard).
 *
 * PRODUCT GUARDRAILS encoded here: no score or rank about people (candidates are ordered by documented evidence through
 * `matchPeople` and the order is never shown as a score); "not documented" is never "no"; PROPOSED ≠ ASSIGNED.
 */
import { daysBetween, formatShortDate } from "./dates";
import { levelFor, matchPeople, type PersonMatch } from "./rules";
import type { Assignment, Availability, Capability, EvidenceLevel, Person, ProposalState, SaveSeatInput, SkillEvidence } from "./schemas";

/* ---------------- Lifecycle ---------------- */

/** Valid proposal transitions (mirrors private.proposal_guard in 0006). */
export const PROPOSAL_TRANSITIONS: Record<ProposalState, readonly ProposalState[]> = {
  draft: ["submitted", "withdrawn"],
  submitted: ["approved", "declined", "changes_requested", "withdrawn"],
  changes_requested: ["submitted", "withdrawn"],
  approved: [],
  declined: [],
  withdrawn: [],
};
export const canTransition = (from: ProposalState, to: ProposalState): boolean => PROPOSAL_TRANSITIONS[from].includes(to);
/** Only a draft or a returned proposal can be edited by its author. */
export const isEditableState = (state: ProposalState): boolean => state === "draft" || state === "changes_requested";

export const PROPOSAL_STATE_LABEL: Record<ProposalState, string> = {
  draft: "Draft", submitted: "In review", changes_requested: "Changes requested", approved: "Approved", declined: "Declined", withdrawn: "Withdrawn",
};

/* ---------------- Capabilities & candidates ---------------- */

/** Resolve a free-text requirement label ("React Native", "native iOS") to a catalogue capability, or null when it is not catalogued. */
export function resolveCapability(label: string, catalogue: Capability[]): Capability | null {
  const l = label.toLowerCase().trim();
  return catalogue.find((c) => c.name.toLowerCase() === l || c.aliases.some((a) => a.toLowerCase().trim() === l)) ?? null;
}

export type CandidateRow = { person: Person; evidence: SkillEvidence[]; availability: Availability };

/**
 * People with documented experience in at least one of the seat's capabilities, in the deterministic, evidence-aware order of
 * `matchPeople` (verified practical experience first… then availability, then name). Requirement labels that are not in the
 * catalogue cannot match anyone and are reported as `uncatalogued`; that means "not documented", never "no".
 */
export function candidatesForSeat(capabilityLabels: string[], rows: CandidateRow[], catalogue: Capability[]): { matches: PersonMatch[]; uncatalogued: string[] } {
  const resolved = capabilityLabels.map((l) => ({ label: l, cap: resolveCapability(l, catalogue) }));
  const requested = resolved.flatMap((r) => (r.cap ? [r.cap] : []));
  return { matches: matchPeople(requested, rows), uncatalogued: resolved.filter((r) => !r.cap).map((r) => r.label) };
}

/** Move or place a person: a person can occupy at most one seat of a proposal ("Move here"). Returns a new array. */
export function placePerson<T extends Pick<SaveSeatInput, "personId">>(seats: T[], seatIndex: number, personId: string | null): T[] {
  return seats.map((s, i) => (i === seatIndex ? { ...s, personId } : personId !== null && s.personId === personId ? { ...s, personId: null } : s));
}

/* ---------------- Availability fit (spec §9.5) ---------------- */

export type SeatFit = {
  /** free = free before kick-off · pending = free before kick-off but unconfirmed · late = free after kick-off · overlap = proposed for another opportunity */
  kind: "free" | "pending" | "late" | "overlap";
  /** "Free now" / "Free from Jan 5 · confirmed" / "Free from Feb 2 · after kick-off, pending" / "Proposed for another team from Jan 12" */
  text: string;
  /** Anything but "free" is a conflict worth surfacing to the lead and the reviewer. */
  conflict: boolean;
};

/** Checked in this order: proposed elsewhere, then after kick-off, then unconfirmed, otherwise free. */
export function seatFit(av: Availability, kickoff: string, currentOpportunityId: string | null, today: string, otherOpportunityName?: (id: string) => string | null): SeatFit {
  if (av.proposedFor && av.proposedFor.opportunityId !== currentOpportunityId) {
    const name = otherOpportunityName?.(av.proposedFor.opportunityId) ?? "another team";
    return { kind: "overlap", text: `Proposed for ${name} from ${formatShortDate(av.proposedFor.from)}`, conflict: true };
  }
  const free = daysBetween(today, av.availableFrom) <= 0 ? "Free now" : `Free from ${formatShortDate(av.availableFrom)}`;
  const pending = av.status === "pending";
  if (daysBetween(kickoff, av.availableFrom) > 0) return { kind: "late", text: `${free} · after kick-off${pending ? ", pending" : ""}`, conflict: true };
  if (pending) return { kind: "pending", text: `${free} · pending`, conflict: true };
  return { kind: "free", text: free === "Free now" ? free : `${free} · confirmed`, conflict: false };
}

/* ---------------- Coverage (spec §9.6) ---------------- */

export type TeamCoverage = {
  /** Some placed member has PROFESSIONAL experience recorded. */
  documented: string[];
  /** Best evidence on the team is training or independent/learning work only. */
  trainingOrIndependent: string[];
  /** Nobody placed has it and it belongs to a seat that has someone: may be a real gap or simply undocumented. */
  notDocumented: string[];
  /** Nobody placed has it and it belongs only to open seats. */
  waitingOnOpenSeats: string[];
};

type CoverageSeat = { capabilities: string[]; personId: string | null };

/** Per required capability, the best level among ALL placed people on the team (not only the seat holder). */
export function teamCoverage(seats: CoverageSeat[], evidenceByPerson: Record<string, SkillEvidence[]>, catalogue: Capability[]): TeamCoverage {
  const placed = seats.filter((s) => s.personId).map((s) => s.personId as string);
  const out: TeamCoverage = { documented: [], trainingOrIndependent: [], notDocumented: [], waitingOnOpenSeats: [] };
  const seen = new Set<string>();
  for (const seat of seats) {
    for (const label of seat.capabilities) {
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const cap = resolveCapability(label, catalogue);
      const levels = cap ? placed.map((p) => levelFor(evidenceByPerson[p] ?? [], cap.id)).filter((l): l is EvidenceLevel => l !== null) : [];
      if (levels.includes("professional")) out.documented.push(label);
      else if (levels.length > 0) out.trainingOrIndependent.push(label);
      else {
        const onFilledSeat = seats.some((s) => s.personId && s.capabilities.some((c) => c.toLowerCase() === key));
        (onFilledSeat ? out.notDocumented : out.waitingOnOpenSeats).push(label);
      }
    }
  }
  return out;
}

/* ---------------- Allocation capacity (mirrors private.assignment_capacity_guard) ---------------- */

type Window = { startsOn: string; availableFrom: string | null; allocation: number };
const NEVER = "9999-12-31";

/**
 * A person's load at a date = the sum of the allocation of assignments whose window [startsOn, availableFrom) contains it
 * (no release date = open-ended). Confirming a new assignment is refused when the PEAK load over its window would exceed 1.0.
 * Overlap is fine as long as it fits: a person can be 0.5 on one project and 0.5 on another.
 */
export function capacityCheck(existing: Pick<Assignment, "startsOn" | "availableFrom" | "allocation">[], candidate: Window): { ok: boolean; peak: number; firstConflictOn: string | null } {
  const end = candidate.availableFrom ?? NEVER;
  const loadAt = (d: string) => existing.filter((a) => a.startsOn <= d && d < (a.availableFrom ?? NEVER)).reduce((n, a) => n + a.allocation, 0);
  const points = [candidate.startsOn, ...existing.map((a) => a.startsOn).filter((d) => d > candidate.startsOn && d < end)];
  let peak = 0, firstConflictOn: string | null = null;
  for (const d of points) {
    const total = Math.round((loadAt(d) + candidate.allocation) * 1000) / 1000;
    if (total > peak) peak = total;
    if (total > 1 && firstConflictOn === null) firstConflictOn = d;
  }
  return { ok: peak <= 1, peak, firstConflictOn };
}

/* ---------------- Derived availability (mirrors public.person_availability, 0007) ---------------- */

/**
 * Availability is DERIVED, never stored: from the person's confirmed assignments (and an overlay of open proposals).
 *  - load at date d = sum of allocation of assignments whose window [startsOn, availableFrom) contains d;
 *  - availableFrom = earliest date d >= asOf with load(d) < 1.0 (candidates: asOf and every release date after it);
 *  - status = "pending" while an assignment still holding the person at asOf, released on or before availableFrom, has an end date nobody confirmed;
 *  - current project = the active assignment that releases last;
 *  - proposedFor = information only: it never changes availableFrom.
 */
export function deriveAvailability(personId: string, asOf: string, assignments: Assignment[], proposedFor: Availability["proposedFor"]): Availability {
  const mine = assignments.filter((a) => a.personId === personId);
  const loadAt = (d: string) => mine.filter((a) => a.startsOn <= d && d < (a.availableFrom ?? NEVER)).reduce((n, a) => n + a.allocation, 0);
  const candidates = [asOf, ...mine.map((a) => a.availableFrom).filter((d): d is string => !!d && d > asOf)].sort();
  const availableFrom = candidates.find((d) => loadAt(d) < 1 - 1e-9) ?? candidates[candidates.length - 1] ?? asOf;
  const holding = mine.filter((a) => a.startsOn <= asOf && asOf < (a.availableFrom ?? NEVER));
  const pending = holding.some((a) => a.availableFrom !== null && a.availableFrom <= availableFrom && !a.endConfirmed);
  const current = [...holding].sort((a, b) => (b.availableFrom ?? NEVER).localeCompare(a.availableFrom ?? NEVER))[0];
  return {
    personId, availableFrom, status: pending ? "pending" : "confirmed",
    currentProject: current?.projectName ?? null, currentProjectEnds: current?.endsOn ?? null, deliveryLead: current?.deliveryLeadName ?? null, proposedFor,
  };
}
