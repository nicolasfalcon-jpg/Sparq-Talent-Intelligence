/**
 * In-memory adapter over the FICTIONAL fixtures.
 *
 * - State lives in the Node.js server process (kept on globalThis so dev hot-reload does not wipe it).
 * - It resets when the server restarts. This is intentional for phase 1 and is NOT persistence.
 * - Phase 2 replaces this file with a Supabase adapter implementing the same interfaces.
 */
import { capabilities } from "@/data/fixtures/capabilities";
import { DEMO_TODAY, notifications, opportunities, users } from "@/data/fixtures/organization";
import { availability as availabilityFixtures, careerInterests, evidence, people, projects } from "@/data/fixtures/people";
import type { Repositories } from "./types";
import { DomainRuleError, ForbiddenError, NotFoundError } from "@/domain/errors";
import { canTransition, capacityCheck, deriveAvailability, isEditableState } from "@/domain/proposals";
import { canOwnerAddEvidence, canOwnerRemoveEvidence } from "@/domain/rules";
import type {
  AppUser, Assignment, Availability, CareerInterests, Capability, ExpressionOfInterest, Opportunity, ProjectExperience, ProposalReview, ProposalSeat, SkillEvidence, TeamProposal,
} from "@/domain/schemas";

type StoredReview = ProposalReview & { proposalId: string; version: number };

type Store = {
  people: typeof people;
  evidence: SkillEvidence[];
  projects: ProjectExperience[];
  interests: CareerInterests[];
  shortlists: Map<string, string[]>;
  assignments: Assignment[];
  proposals: TeamProposal[];
  reviews: StoredReview[];
  eois: ExpressionOfInterest[];
  seq: number;
};

const SEED_START = "2025-01-06"; // invented start of the fixtures' current engagements (same as the database seed)
const userById = (id: string): AppUser | undefined => users.find((u) => u.id === id);
const leadIdByName = (name: string | null): string | null => (name ? (users.find((u) => u.role === "delivery_lead" && u.name === name)?.id ?? null) : null);
const opportunityBySlug = (slug: string): Opportunity | undefined => opportunities.find((o) => o.id === slug);

/** The fixtures' availability, expressed as what it really is: confirmed assignments (so availability can be DERIVED from them). */
function seedAssignments(): Assignment[] {
  return availabilityFixtures.flatMap((av): Assignment[] => {
    if (!av.currentProject || !av.currentProjectEnds) return [];
    const leadId = leadIdByName(av.deliveryLead) ?? "u-rafael";
    return [{
      id: `seed-a-${av.personId}`, personId: av.personId, opportunityId: null, projectName: av.currentProject, startsOn: SEED_START, endsOn: av.currentProjectEnds,
      availableFrom: av.availableFrom, allocation: 1, endConfirmed: av.status === "confirmed", deliveryLeadId: leadId, deliveryLeadName: userById(leadId)?.name ?? av.deliveryLead ?? "",
      proposalSeatId: null,
    }];
  });
}

/** Vela Bank's submitted proposal (Lucía as AI, Camila as QA), exactly as in the fixtures and the database seed. */
function seedProposals(): TeamProposal[] {
  const vela = opportunityBySlug("vela");
  if (!vela) return [];
  const at = "2026-11-20T10:00:00.000Z";
  return [{
    id: "p-vela", opportunityId: "vela", title: `${vela.client}, ${vela.name}`, brief: vela.description, noteForReviewer: "", state: "submitted", version: 1,
    createdBy: "u-laura", createdByName: userById("u-laura")?.name ?? "", submittedAt: at, updatedAt: at, review: null,
    seats: vela.roles.map((r): ProposalSeat => ({
      id: `s-${r.id}`, roleRequirementId: r.id, title: r.title, capabilities: r.capabilities, seniority: null, allocation: 1,
      personId: r.proposedPersonId, seatState: r.proposedPersonId ? "proposed" : "open", assignmentId: null,
    })),
  }];
}

function seedEois(): ExpressionOfInterest[] {
  return [{ id: "eoi-seed-ana", personId: "ana", roleRequirementId: "vela-mobile", opportunityId: "vela", note: "I finish Meridian Health on Dec 19 and would love to bring my React Native experience to an AI product.", status: "shared", createdAt: "2026-11-23T09:00:00.000Z" }];
}

function freshStore(): Store {
  return {
    people: structuredClone(people),
    evidence: structuredClone(evidence),
    projects: structuredClone(projects),
    interests: structuredClone(careerInterests),
    shortlists: new Map(),
    assignments: seedAssignments(),
    proposals: seedProposals(),
    reviews: [],
    eois: seedEois(),
    seq: 1,
  };
}

const g = globalThis as unknown as { __sparqMemoryStore?: Store };
function store(): Store {
  g.__sparqMemoryStore ??= freshStore();
  return g.__sparqMemoryStore;
}

/** Test helper: reset the in-memory state to the original fictional dataset. */
export function resetMemoryStore(): void {
  g.__sparqMemoryStore = freshStore();
}

function resolveCapability(label: string, catalogue: Capability[]): string {
  const l = label.toLowerCase().trim();
  const hit = catalogue.find((c) => c.name.toLowerCase() === l || c.aliases.some((a) => a.trim() === l));
  return hit ? hit.id : `custom:${l.replace(/[^a-z0-9]+/g, "-")}`;
}

/** Seats of open proposals (submitted/approved) that are NOT yet confirmed: information only, never an occupation. */
function proposedFor(s: Store, personId: string): Availability["proposedFor"] {
  const hits = s.proposals
    .filter((p) => (p.state === "submitted" || p.state === "approved") && p.opportunityId)
    .flatMap((p) => p.seats.filter((seat) => seat.personId === personId && !seat.assignmentId).map(() => opportunityBySlug(p.opportunityId as string)))
    .filter((o): o is Opportunity => !!o)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  return hits[0] ? { opportunityId: hits[0].id, from: hits[0].kickoff } : null;
}

function liveOpportunity(o: Opportunity): Opportunity {
  const open = store().proposals.filter((p) => p.opportunityId === o.id && (p.state === "submitted" || p.state === "approved")).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { ...o, roles: o.roles.map((r) => ({ ...r, proposedPersonId: open.flatMap((p) => p.seats).find((seat) => seat.roleRequirementId === r.id && seat.personId)?.personId ?? null })) };
}

function forbid(message: string): never { throw new ForbiddenError(message); }

export function createMemoryRepositories(): Repositories {
  const aggregate = (id: string) => {
    const s = store();
    const person = s.people.find((p) => p.id === id);
    if (!person) return null;
    return { person, evidence: s.evidence.filter((e) => e.personId === id), availability: deriveAvailability(id, DEMO_TODAY, s.assignments, proposedFor(s, id)) };
  };

  /** Proposals the viewer may see: authors their own (drafts included); staffing leads every non-draft; a delivery lead the non-drafts of opportunities they lead. */
  const visible = (viewer: { id: string; role: string }, p: TeamProposal): boolean => {
    if (p.createdBy === viewer.id) return true;
    if (p.state === "draft") return false;
    if (viewer.role === "staffing_lead") return true;
    return viewer.role === "delivery_lead" && !!p.opportunityId && opportunityBySlug(p.opportunityId)?.deliveryLeadId === viewer.id;
  };
  const withReview = (p: TeamProposal): TeamProposal => {
    const r = store().reviews.find((x) => x.proposalId === p.id && x.version === p.version);
    return structuredClone({ ...p, review: r ? { decision: r.decision, note: r.note, reviewerId: r.reviewerId, reviewerName: r.reviewerName, at: r.at } : null });
  };
  const findProposal = (id: string): TeamProposal => {
    const p = store().proposals.find((x) => x.id === id);
    if (!p) throw new NotFoundError("Proposal not found");
    return p;
  };
  const actorOf = (id: string): AppUser => userById(id) ?? forbid("Unknown user");
  const touch = (p: TeamProposal) => { p.updatedAt = new Date().toISOString(); };

  return {
    clock: { today: () => DEMO_TODAY },

    talent: {
      async listCapabilities() { return capabilities; },
      async listPeople() { return store().people.map((p) => aggregate(p.id)).filter((x) => x !== null); },
      async getPerson(id) { return aggregate(id); },
      async listProjects(personId) { return store().projects.filter((p) => p.personId === personId); },
      async getCareerInterests(personId) { const r = store().interests.find((i) => i.personId === personId); return r ? structuredClone(r) : null; },
      async getSharedInterests(personId) {
        const r = store().interests.find((i) => i.personId === personId);
        return r ? r.shared.filter((label) => r.interests[label]) : [];
      },
      async updateSummary(personId, summary) {
        const p = store().people.find((x) => x.id === personId);
        if (!p) throw new Error("Person not found");
        p.summary = summary;
      },
      async addSkill(personId, input) {
        const s = store();
        const capabilityId = resolveCapability(input.label, capabilities);
        const rule = canOwnerAddEvidence(s.evidence.filter((e) => e.personId === personId), { capabilityId, level: input.level, label: input.label });
        if (!rule.allowed) throw new DomainRuleError(rule.code, rule.reason);
        // Whatever the caller wants, a row added through this path is self-reported and carries no verification stamp.
        const row: SkillEvidence = { id: `${personId}-ev-new-${s.seq++}`, personId, capabilityId, label: input.label, level: input.level, detail: "Added by the person · awaiting confirmation", verification: "self_reported" };
        s.evidence.push(row);
        return row;
      },
      async removeSkill(personId, evidenceId) {
        const s = store();
        const row = s.evidence.find((e) => e.personId === personId && e.id === evidenceId);
        if (!row) return false;
        const rule = canOwnerRemoveEvidence(row);
        if (!rule.allowed) throw new DomainRuleError(rule.code, rule.reason);
        s.evidence = s.evidence.filter((e) => e !== row);
        return true;
      },
      async addProject(personId, input) {
        const s = store();
        const row: ProjectExperience = { id: `${personId}-pj-new-${s.seq++}`, personId, period: input.period, client: "Sparq", role: input.role, title: input.title, summary: input.what, tags: [], highlights: [input.what], verification: "self_reported" };
        s.projects.unshift(row);
        return row;
      },
      async toggleInterest(personId, interest) {
        const s = store();
        let row = s.interests.find((i) => i.personId === personId);
        if (!row) { row = { personId, interests: {}, shared: [] }; s.interests.push(row); }
        row.interests[interest] = !row.interests[interest];
        // Deselecting an interest also withdraws any disclosure of it: nothing stays shared that the person no longer holds.
        if (!row.interests[interest]) row.shared = row.shared.filter((l) => l !== interest);
        return structuredClone(row);
      },
      async setInterestShared(personId, interest, shared) {
        const s = store();
        const row = s.interests.find((i) => i.personId === personId);
        if (!row || !row.interests[interest]) throw new DomainRuleError("interest_not_selected", "Choose this interest first, then decide who can see it.");
        row.shared = shared ? [...new Set([...row.shared, interest])] : row.shared.filter((l) => l !== interest);
        return structuredClone(row);
      },
      async setWorkPreferencesShared(personId, shared) {
        const p = store().people.find((x) => x.id === personId);
        if (!p) throw new Error("Person not found");
        p.workPreferencesShared = shared;
      },
    },

    opportunities: {
      // Live state: a role is "proposed" when the latest submitted/approved proposal for that opportunity places someone in it.
      async list() { return opportunities.map(liveOpportunity); },
      async get(id) { const o = opportunityBySlug(id); return o ? liveOpportunity(o) : null; },
    },

    shortlists: {
      async get(owner) { return store().shortlists.get(owner) ?? []; },
      async toggle(owner, personId) {
        const s = store();
        const cur = s.shortlists.get(owner) ?? [];
        const next = cur.includes(personId) ? cur.filter((x) => x !== personId) : [...cur, personId];
        s.shortlists.set(owner, next);
        return next;
      },
    },

    proposals: {
      async list(viewer) { return store().proposals.filter((p) => visible(viewer, p)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(withReview); },
      async get(viewer, id) { const p = store().proposals.find((x) => x.id === id); return p && visible(viewer, p) ? withReview(p) : null; },

      async save(actorUserId, input) {
        const s = store();
        const actor = actorOf(actorUserId);
        if (actor.role !== "staffing_lead") forbid("Only staffing leads can write proposals.");
        const opp = opportunityBySlug(input.opportunityId);
        if (!opp) throw new DomainRuleError("unknown_opportunity", "That opportunity does not exist.");
        const seen = new Set<string>();
        const seats: ProposalSeat[] = input.seats.map((seat) => {
          if (seat.roleRequirementId && !opp.roles.some((r) => r.id === seat.roleRequirementId)) throw new DomainRuleError("unknown_role", "A seat refers to a role of another opportunity.");
          if (seat.personId) {
            if (!s.people.some((p) => p.id === seat.personId)) throw new DomainRuleError("unknown_person", "A seat refers to a person that does not exist.");
            if (seen.has(seat.personId)) throw new DomainRuleError("duplicate_person", "A person can occupy only one seat of a proposal.");
            seen.add(seat.personId);
          }
          return {
            id: `s-${s.seq++}`, roleRequirementId: seat.roleRequirementId ?? null, title: seat.title, capabilities: [...seat.capabilities], seniority: seat.seniority ?? null,
            allocation: seat.allocation ?? 1, personId: seat.personId ?? null, seatState: seat.personId ? "proposed" : "open", assignmentId: null,
          };
        });
        if (input.id) {
          const p = findProposal(input.id);
          if (p.createdBy !== actor.id) forbid("Only the author can edit a proposal.");
          if (!isEditableState(p.state)) throw new DomainRuleError("proposal_not_editable", `A ${p.state.replace("_", " ")} proposal can no longer be edited.`);
          Object.assign(p, { opportunityId: opp.id, title: input.title, brief: input.brief ?? "", noteForReviewer: input.noteForReviewer ?? "", seats });
          touch(p);
          return withReview(p);
        }
        const now = new Date().toISOString();
        const p: TeamProposal = {
          id: `p-${s.seq++}`, opportunityId: opp.id, title: input.title, brief: input.brief ?? "", noteForReviewer: input.noteForReviewer ?? "", state: "draft", version: 1,
          createdBy: actor.id, createdByName: actor.name, submittedAt: null, updatedAt: now, seats, review: null,
        };
        s.proposals.push(p);
        return withReview(p);
      },

      async submit(actorUserId, id, note) {
        const p = findProposal(id);
        const actor = actorOf(actorUserId);
        if (p.createdBy !== actor.id || actor.role !== "staffing_lead") forbid("Only the staffing lead who wrote a proposal can submit it.");
        if (!isEditableState(p.state) || !canTransition(p.state, "submitted")) throw new DomainRuleError("invalid_transition", `A ${p.state.replace("_", " ")} proposal cannot be submitted.`);
        if (!p.opportunityId) throw new DomainRuleError("unknown_opportunity", "Choose an opportunity before submitting.");
        if (p.seats.length === 0) throw new DomainRuleError("proposal_empty", "A proposal needs at least one seat.");
        if (p.state === "changes_requested") p.version += 1;
        p.state = "submitted";
        p.submittedAt = new Date().toISOString();
        if (note !== undefined) p.noteForReviewer = note;
        touch(p);
        return withReview(p);
      },

      async withdraw(actorUserId, id) {
        const p = findProposal(id);
        if (p.createdBy !== actorOf(actorUserId).id) forbid("Only the author can withdraw a proposal.");
        if (!canTransition(p.state, "withdrawn")) throw new DomainRuleError("invalid_transition", `A ${p.state.replace("_", " ")} proposal cannot be withdrawn.`);
        p.state = "withdrawn";
        touch(p);
        return withReview(p);
      },

      async review(actorUserId, id, decision, note) {
        const s = store();
        const p = findProposal(id);
        const actor = actorOf(actorUserId);
        const opp = p.opportunityId ? opportunityBySlug(p.opportunityId) : undefined;
        if (p.createdBy === actor.id) forbid("You cannot review your own proposal.");
        if (actor.role !== "delivery_lead" || !opp || opp.deliveryLeadId !== actor.id) forbid("Only the delivery lead assigned to this opportunity can review its proposals.");
        if (p.state !== "submitted" || !canTransition(p.state, decision)) throw new DomainRuleError("invalid_transition", `A ${p.state.replace("_", " ")} proposal cannot be reviewed.`);
        if (decision !== "approved" && !(note ?? "").trim()) throw new DomainRuleError("note_required", "Explain your decision so the author knows what to do next.");
        s.reviews.push({ proposalId: p.id, version: p.version, decision, note: (note ?? "").trim() || null, reviewerId: actor.id, reviewerName: actor.name, at: new Date().toISOString() });
        p.state = decision; // approving assigns NOBODY: confirmSeat is a separate, explicit act
        touch(p);
        return withReview(p);
      },

      async confirmSeat(actorUserId, input) {
        const s = store();
        const actor = actorOf(actorUserId);
        const p = s.proposals.find((x) => x.seats.some((seat) => seat.id === input.seatId));
        const seat = p?.seats.find((x) => x.id === input.seatId);
        if (!p || !seat) throw new NotFoundError("Seat not found");
        const opp = p.opportunityId ? opportunityBySlug(p.opportunityId) : undefined;
        if (actor.role !== "delivery_lead" || !opp || opp.deliveryLeadId !== actor.id) forbid("Only the delivery lead assigned to this opportunity can confirm assignments.");
        if (p.state !== "approved") throw new DomainRuleError("not_approved", `Only seats of an approved proposal can be confirmed (it is ${p.state.replace("_", " ")}).`);
        if (!seat.personId) throw new DomainRuleError("seat_has_no_person", "This seat has no proposed person.");
        if (actor.personId && actor.personId === seat.personId) forbid("You cannot confirm your own assignment.");
        if (seat.assignmentId) throw new DomainRuleError("seat_already_confirmed", "This seat is already confirmed.");
        if ((input.endsOn === null) !== (input.availableFrom === null) || (input.endsOn && input.endsOn < input.startsOn) || (input.endsOn && input.availableFrom && input.availableFrom <= input.endsOn)) {
          throw new DomainRuleError("invalid_dates", "Give both the last day and the first free day (after it), or neither for an open-ended assignment.");
        }
        const allocation = input.allocation ?? seat.allocation;
        const check = capacityCheck(s.assignments.filter((a) => a.personId === seat.personId), { startsOn: input.startsOn, availableFrom: input.availableFrom, allocation });
        if (!check.ok) throw new DomainRuleError("capacity_exceeded", `This would take the person above full-time (${Math.round(check.peak * 100) / 100} FTE from ${check.firstConflictOn}). Lower the allocation or move the dates.`);
        const a: Assignment = {
          id: `a-${s.seq++}`, personId: seat.personId, opportunityId: opp.id, projectName: opp.client, startsOn: input.startsOn, endsOn: input.endsOn, availableFrom: input.availableFrom,
          allocation, endConfirmed: false, deliveryLeadId: actor.id, deliveryLeadName: actor.name, proposalSeatId: seat.id,
        };
        s.assignments.push(a);
        seat.assignmentId = a.id;
        seat.seatState = "confirmed";
        touch(p);
        return structuredClone(a);
      },
    },

    planning: {
      async listAssignments(viewer) {
        const all = store().assignments;
        const mine = viewer.role === "staffing_lead" ? all
          : viewer.role === "delivery_lead" ? all.filter((a) => a.deliveryLeadId === viewer.id)
          : viewer.role === "engineer" && viewer.personId ? all.filter((a) => a.personId === viewer.personId) : [];
        return structuredClone(mine).sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.personId.localeCompare(b.personId));
      },
    },

    interests: {
      async listForPerson(personId) { return structuredClone(store().eois.filter((e) => e.personId === personId)); },
      async listSharedFor(viewer) {
        const shared = store().eois.filter((e) => e.status === "shared");
        const mine = viewer.role === "staffing_lead" ? shared : viewer.role === "delivery_lead" ? shared.filter((e) => opportunityBySlug(e.opportunityId)?.deliveryLeadId === viewer.id) : [];
        return structuredClone(mine);
      },
      async express(personId, roleRequirementId, note) {
        const s = store();
        const opp = opportunities.find((o) => o.roles.some((r) => r.id === roleRequirementId));
        if (!opp || (opp.status !== "Staffing" && opp.status !== "Open")) throw new DomainRuleError("interest_closed", "This opportunity is not open for expressions of interest.");
        let row = s.eois.find((e) => e.personId === personId && e.roleRequirementId === roleRequirementId);
        if (row) { row.status = "shared"; row.note = note; }
        else { row = { id: `eoi-${s.seq++}`, personId, roleRequirementId, opportunityId: opp.id, note, status: "shared", createdAt: new Date().toISOString() }; s.eois.push(row); }
        return structuredClone(row);
      },
      async withdraw(personId, roleRequirementId) {
        const row = store().eois.find((e) => e.personId === personId && e.roleRequirementId === roleRequirementId);
        if (row) row.status = "withdrawn";
      },
    },

    directory: {
      async getCurrentUser() { throw new Error("getCurrentUser is only available in Supabase mode."); },
      async getUserByRole(role) {
        const u = users.find((x) => x.role === role);
        if (!u) throw new Error(`No demo user for role ${role}`);
        return u;
      },
      async listNotifications(audience) { return notifications.filter((n) => n.audience === audience); },
    },
  };
}
