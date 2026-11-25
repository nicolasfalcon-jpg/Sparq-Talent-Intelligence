/**
 * Repository contracts (ports). UI and server actions depend ONLY on these interfaces.
 * Phase 1: `memory` adapter over fictional fixtures. Phase 2: `supabase` adapter (see docs/handoff/06-roadmap.md).
 * All methods are async so swapping to a network-backed adapter needs no caller changes.
 */
import type {
  AppUser, Assignment, Availability, Capability, CareerInterests, ConfirmSeatInput, EvidenceLevel, ExpressionOfInterest, Notification, Opportunity,
  Person, ProjectExperience, ReviewDecision, SaveProposalInput, SkillEvidence, TeamProposal, UserRole,
} from "@/domain/schemas";
import type { Actor } from "@/domain/policy";

/** A person with everything needed to render cards and previews. */
export type PersonAggregate = { person: Person; evidence: SkillEvidence[]; availability: Availability };

/**
 * UNSCOPED data access: these methods know nothing about who is asking. Server code must reach people data through
 * `scopedTalent(repos, actor)` (./scoped.ts), which applies authorization and privacy. Importing repositories directly
 * from a route or page is blocked by ESLint (see eslint.config.mjs).
 */
export interface TalentRepository {
  listCapabilities(): Promise<Capability[]>;
  listPeople(): Promise<PersonAggregate[]>;
  getPerson(id: string): Promise<PersonAggregate | null>;
  listProjects(personId: string): Promise<ProjectExperience[]>;
  /** The owner's full interests (private included). Staffing views must use `getSharedInterests` instead. */
  getCareerInterests(personId: string): Promise<CareerInterests | null>;
  /** Only the interests the owner voluntarily shared with staffing (selected AND shared). */
  getSharedInterests(personId: string): Promise<string[]>;
  /* Mutations performed by the profile owner (authorisation is enforced in the server action layer). */
  updateSummary(personId: string, summary: string): Promise<void>;
  /** Always creates a self-reported row; verification can never be set through this method. Throws DomainRuleError on duplicates. */
  addSkill(personId: string, input: { label: string; level: EvidenceLevel }): Promise<SkillEvidence>;
  /** Removes an unverified row of that person. Throws DomainRuleError("evidence_locked") for verified evidence. Returns false if the row is not theirs. */
  removeSkill(personId: string, evidenceId: string): Promise<boolean>;
  addProject(personId: string, input: { title: string; role: string; what: string; period: string }): Promise<ProjectExperience>;
  toggleInterest(personId: string, interest: string): Promise<CareerInterests>;
  /** Share or hide one SELECTED interest. Throws DomainRuleError("interest_not_selected") otherwise. */
  setInterestShared(personId: string, interest: string, shared: boolean): Promise<CareerInterests>;
  setWorkPreferencesShared(personId: string, shared: boolean): Promise<void>;
}

export interface OpportunityRepository {
  list(): Promise<Opportunity[]>;
  get(id: string): Promise<Opportunity | null>;
}

export interface ShortlistRepository {
  get(ownerUserId: string): Promise<string[]>;
  toggle(ownerUserId: string, personId: string): Promise<string[]>;
}

export interface DirectoryRepository {
  /** MEMORY ADAPTER ONLY (demo persona). The Supabase adapter throws: real sessions use `getCurrentUser`. */
  getUserByRole(role: UserRole): Promise<AppUser>;
  /** SUPABASE ADAPTER ONLY: the user of the request's JWT (null without a valid session). The memory adapter throws. */
  getCurrentUser(): Promise<AppUser | null>;
  listNotifications(audience: UserRole): Promise<Notification[]>;
}

/**
 * Proposals and assignments. PROPOSED ≠ ASSIGNED: `review` never creates an assignment; `confirmSeat` does, and only for a seat of an
 * APPROVED proposal. In the Supabase adapter every method runs with the caller's JWT, so RLS and the SQL functions
 * (submit_proposal, review_proposal, confirm_assignment…) are the enforcement. The memory adapter reproduces the same rules for
 * tests. Reads take the viewer because the memory adapter has no RLS: it filters what the viewer may see (authors see their
 * drafts, staffing leads see every submitted proposal, a delivery lead sees submitted proposals of opportunities they lead).
 * Writes take the acting user's id (memory needs it for authorship; Supabase uses the JWT and ignores it).
 * All write methods throw `ForbiddenError` (not allowed), `NotFoundError` or `DomainRuleError` (invalid transition or input).
 */
export interface ProposalRepository {
  list(viewer: Actor): Promise<TeamProposal[]>;
  get(viewer: Actor, id: string): Promise<TeamProposal | null>;
  /** Create (no id) or replace the seats of a draft / changes_requested proposal owned by the actor. */
  save(actorUserId: string, input: SaveProposalInput): Promise<TeamProposal>;
  /** draft | changes_requested → submitted (version + 1 after changes_requested). Requires an opportunity and at least one seat. */
  submit(actorUserId: string, id: string, note?: string): Promise<TeamProposal>;
  withdraw(actorUserId: string, id: string): Promise<TeamProposal>;
  /** submitted → approved | declined | changes_requested, by the delivery lead of that opportunity (never the author). Approving assigns NOBODY. */
  review(actorUserId: string, id: string, decision: ReviewDecision, note?: string): Promise<TeamProposal>;
  /** Turn ONE seat of an approved proposal into an assignment. Capacity (peak allocation ≤ 1.0) is enforced. */
  confirmSeat(actorUserId: string, input: ConfirmSeatInput): Promise<Assignment>;
}

export interface PlanningRepository {
  /** Assignments the viewer may see (staffing leads: all; a delivery lead: the ones they lead; a person: their own). */
  listAssignments(viewer: Actor): Promise<Assignment[]>;
}

/** Expressions of interest in a role (NOT private career interests). */
export interface InterestRepository {
  /** The person's own expressions (shared and withdrawn). */
  listForPerson(personId: string): Promise<ExpressionOfInterest[]>;
  /** Shared expressions the viewer may see (staffing leads: all; a delivery lead: their opportunities'). */
  listSharedFor(viewer: Actor): Promise<ExpressionOfInterest[]>;
  /** Share (or re-share) interest in a role that is open for interest. */
  express(personId: string, roleRequirementId: string, note: string): Promise<ExpressionOfInterest>;
  withdraw(personId: string, roleRequirementId: string): Promise<void>;
}

export interface Clock {
  /** Business "today" as YYYY-MM-DD. Fixed in demo mode so the fictional dataset stays coherent. */
  today(): string;
}

export type Repositories = {
  talent: TalentRepository;
  opportunities: OpportunityRepository;
  shortlists: ShortlistRepository;
  directory: DirectoryRepository;
  proposals: ProposalRepository;
  planning: PlanningRepository;
  interests: InterestRepository;
  clock: Clock;
};
