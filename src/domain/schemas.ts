/**
 * Domain contracts for Sparq Talent Intelligence.
 *
 * These Zod schemas are the single source of truth for the shape of data that
 * crosses a boundary (repository → UI, server action input, API payloads).
 * TypeScript types are inferred from them. The Supabase schema in
 * `supabase/migrations` mirrors these shapes.
 *
 * Product principle encoded here: there is NO numeric score or rank on a person.
 * Evidence is qualitative (level + source) and humans make every decision.
 */
import { z } from "zod";

/** ISO calendar date, e.g. "2027-01-05". Dates are timezone-free business dates. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export type IsoDate = z.infer<typeof IsoDate>;

export const Discipline = z.enum(["Mobile", "Frontend", "Backend", "AI", "Data", "Cloud", "Architecture", "Quality"]);
export type Discipline = z.infer<typeof Discipline>;
export const DISCIPLINES = Discipline.options;

/**
 * EVIDENCE SOURCE: where a piece of evidence comes from. (The field is still called `level` for historical
 * reasons; it is NOT a verification state and says nothing about how trustworthy the claim is.)
 * Ordered from most to least practical:
 * - professional: professional experience (delivered on a client or internal project)
 * - independent: independent projects (personal / open-source / prototype work)
 * - training: education and training (course, certification, internal training)
 * - emerging: learning and experimentation (declared growth area)
 * Independent work stays discoverable and valuable; the source never replaces verification.
 */
export const EvidenceLevel = z.enum(["professional", "independent", "training", "emerging"]);
export type EvidenceLevel = z.infer<typeof EvidenceLevel>;
/** Semantic alias: use this name in new code. */
export type EvidenceSource = EvidenceLevel;
export const EVIDENCE_ORDER: readonly EvidenceLevel[] = ["professional", "independent", "training", "emerging"];

/**
 * VERIFICATION STATUS: has someone other than the owner confirmed the claim? Independent of the source.
 * - self_reported: declared by the person, nobody has confirmed it (the default for anything the owner adds)
 * - pending: the person asked for confirmation; a reviewer (future delivery-lead role) has not decided yet
 * - verified: confirmed by a reviewer. Only a reviewer can set it; owners can never set or clear it.
 * "Not documented" is NOT a verification state: it is the absence of any evidence row, and never means the person
 * lacks the capability.
 */
export const Verification = z.enum(["self_reported", "pending", "verified"]);
export type Verification = z.infer<typeof Verification>;
export const VERIFICATION_ORDER: readonly Verification[] = ["verified", "pending", "self_reported"];

/** Partial date used for verification stamps: "2026", "2026-11" or "2026-11-12". */
export const PartialDate = z.string().regex(/^\d{4}(-\d{2}){0,2}$/, "Expected YYYY, YYYY-MM or YYYY-MM-DD");

export const SkillGroup = z.enum(["mobile", "web", "ai", "data", "cloud", "quality", "architecture"]);
export type SkillGroup = z.infer<typeof SkillGroup>;

/** A capability in the shared skills catalogue. `aliases` power plain-language search. */
export const Capability = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  group: SkillGroup,
  aliases: z.array(z.string()).default([]),
});
export type Capability = z.infer<typeof Capability>;

/** One documented piece of evidence that a person has a capability. */
export const SkillEvidence = z.object({
  id: z.string().min(1),
  personId: z.string().min(1),
  capabilityId: z.string().min(1),
  /** Display label as the person wrote it, e.g. "Swift / SwiftUI". */
  label: z.string().min(1),
  level: EvidenceLevel,
  /** Short, human-readable description of the evidence, e.g. "5 projects · lead on Meridian Health". */
  detail: z.string(),
  /** Defaults to the safe value: anything without an explicit reviewer confirmation is self-reported. */
  verification: Verification.default("self_reported"),
  /** Who confirmed it and when. Present only when verification is "verified"; part of the verification history. */
  verifiedBy: z.string().optional(),
  verifiedOn: PartialDate.optional(),
});
export type SkillEvidence = z.infer<typeof SkillEvidence>;

export const ProjectExperience = z.object({
  id: z.string().min(1),
  personId: z.string().min(1),
  period: z.string(),
  client: z.string(),
  role: z.string(),
  title: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  highlights: z.array(z.string()),
  /** Same verification model as skill evidence (replaces the old free-text `source`). */
  verification: Verification.default("self_reported"),
  verifiedBy: z.string().optional(),
  verifiedOn: PartialDate.optional(),
  /** Client category used when client names are hidden on export. */
  clientCategory: z.string().optional(),
});
export type ProjectExperience = z.infer<typeof ProjectExperience>;

export const AvailabilityStatus = z.enum(["confirmed", "pending"]);
export type AvailabilityStatus = z.infer<typeof AvailabilityStatus>;

/** Current assignment and the date a person becomes available. */
export const Availability = z.object({
  personId: z.string().min(1),
  availableFrom: IsoDate,
  status: AvailabilityStatus,
  currentProject: z.string().nullable(),
  currentProjectEnds: IsoDate.nullable(),
  deliveryLead: z.string().nullable(),
  /** Set when the person is proposed (not assigned) for an upcoming opportunity. */
  proposedFor: z.object({ opportunityId: z.string(), from: IsoDate }).nullable(),
});
export type Availability = z.infer<typeof Availability>;

export const CareerTimelineEntry = z.object({ when: z.string(), role: z.string(), org: z.string(), current: z.boolean().default(false) });
export type CareerTimelineEntry = z.infer<typeof CareerTimelineEntry>;

export const Certification = z.object({ name: z.string(), date: z.string() });
export type Certification = z.infer<typeof Certification>;

/** A professional profile (the Talent Passport subject). */
export const Person = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  headline: z.string(),
  discipline: Discipline,
  location: z.string(),
  country: z.string().optional(),
  yearsExperience: z.number().int().nonnegative(),
  atSparqSince: z.number().int().optional(),
  languages: z.array(z.string()).default([]),
  summary: z.string(),
  /** Three capabilities shown on cards. Display only — not a ranking. */
  topSkills: z.array(z.string()).max(3),
  journey: z.array(CareerTimelineEntry).default([]),
  certifications: z.array(Certification).default([]),
  /** Professional preferences (e.g. travel, team size). Disclosed to staffing only when `workPreferencesShared` is true (absent = private). */
  workPreferences: z.string().optional(),
  workPreferencesShared: z.boolean().optional(),
  /**
   * Optional: how the person chooses to group expertise on their passport.
   * When absent, groups are derived from the capability catalogue.
   */
  passportGroups: z.array(z.object({ title: z.string(), description: z.string(), groups: z.array(SkillGroup) })).optional(),
  passportUpdated: z.string().optional(),
});
export type Person = z.infer<typeof Person>;

/**
 * PRIVATE BY DEFAULT. Career goals and learning interests belong to the person. `shared` lists the labels the person
 * has voluntarily disclosed to staffing; everything else must never reach a staffing view, export, search result or
 * assistant answer. Interest in a specific opportunity is a different concept (expressions of interest, phase 2).
 */
export const CareerInterests = z.object({
  personId: z.string(),
  /** Interest label → selected. Used only to surface opportunities to the person. */
  interests: z.record(z.string(), z.boolean()),
  /** Selected labels the owner chose to share with staffing. Empty by default. */
  shared: z.array(z.string()).default([]),
});
export type CareerInterests = z.infer<typeof CareerInterests>;

export const OpportunityStatus = z.enum(["Staffing", "Open", "Upcoming"]);
export type OpportunityStatus = z.infer<typeof OpportunityStatus>;

export const RoleRequirement = z.object({
  id: z.string().min(1),
  title: z.string(),
  capabilities: z.array(z.string()),
  /** Proposed ≠ assigned. Assignment only happens after human review. */
  proposedPersonId: z.string().nullable(),
});
export type RoleRequirement = z.infer<typeof RoleRequirement>;

export const Opportunity = z.object({
  id: z.string().min(1),
  client: z.string(),
  clientInitials: z.string().max(3),
  industry: z.string(),
  name: z.string(),
  short: z.string(),
  description: z.string(),
  status: OpportunityStatus,
  kickoff: IsoDate,
  durationMonths: z.number().int().positive(),
  /** Display name of the delivery lead ("" when the viewer is not allowed to read it). */
  deliveryLead: z.string(),
  /** User id of the assigned delivery lead, when known. Used to scope what a delivery lead can see and review. */
  deliveryLeadId: z.string().nullable().default(null),
  capabilities: z.array(z.string()),
  interestNote: z.string(),
  roles: z.array(RoleRequirement).min(1),
});
export type Opportunity = z.infer<typeof Opportunity>;

/**
 * Application roles (mirrors the database enum `app_role`). One role per demo account today; the database allows more
 * than one role per user, but the application resolves a single role per session.
 *  - engineer: owns a Talent Passport and a personal space (My Space).
 *  - staffing_lead: composes proposals (Fill a Role, Build a Team); sees the whole talent directory.
 *  - delivery_lead: reviews proposals and confirms assignments, only for opportunities they are assigned to.
 *  - admin: administration only (a landing page; no business powers, no staffing data).
 */
export const UserRole = z.enum(["engineer", "staffing_lead", "delivery_lead", "admin"]);
export type UserRole = z.infer<typeof UserRole>;

export const AppUser = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  role: UserRole,
  /** The professional profile owned by this user, if any. */
  personId: z.string().nullable(),
  portraitId: z.string(),
});
export type AppUser = z.infer<typeof AppUser>;

export const Notification = z.object({
  id: z.string(),
  audience: UserRole,
  actorPersonId: z.string(),
  actorName: z.string(),
  text: z.string(),
  when: z.string(),
  href: z.string(),
});
export type Notification = z.infer<typeof Notification>;

/* ---------- Proposals, assignments and expressions of interest (phase B) ---------- */

/**
 * PROPOSED ≠ ASSIGNED. A proposal is a staffing lead's suggestion. Its lifecycle mirrors the database enum `proposal_state`:
 * draft → submitted → approved | declined | changes_requested (→ resubmitted) | withdrawn. Approving a proposal creates NO
 * assignment: the delivery lead confirms each seat separately (`confirmSeat`), which is the only way an Assignment exists.
 */
export const ProposalState = z.enum(["draft", "submitted", "changes_requested", "approved", "declined", "withdrawn"]);
export type ProposalState = z.infer<typeof ProposalState>;
export const ReviewDecision = z.enum(["approved", "declined", "changes_requested"]);
export type ReviewDecision = z.infer<typeof ReviewDecision>;

export const Seniority = z.enum(["Mid", "Senior", "Lead"]);
export type Seniority = z.infer<typeof Seniority>;

/** open: nobody proposed · proposed: a person is placed (not assigned) · confirmed: the seat became a real assignment. */
export const SeatState = z.enum(["open", "proposed", "confirmed"]);
export type SeatState = z.infer<typeof SeatState>;

export const ProposalSeat = z.object({
  id: z.string().min(1),
  /** Slug of the opportunity's role requirement this seat answers, or null for a seat the lead added. */
  roleRequirementId: z.string().nullable(),
  title: z.string().min(1).max(80),
  capabilities: z.array(z.string().min(1).max(60)).max(12),
  seniority: Seniority.nullable(),
  /** Fraction of a full-time engagement: 1 = full-time, 0.5 = half-time. */
  allocation: z.number().gt(0).lte(1),
  personId: z.string().nullable(),
  seatState: SeatState,
  /** Set when the seat has been confirmed into an Assignment. */
  assignmentId: z.string().nullable().default(null),
});
export type ProposalSeat = z.infer<typeof ProposalSeat>;

export const ProposalReview = z.object({
  decision: ReviewDecision,
  note: z.string().nullable(),
  reviewerId: z.string(),
  reviewerName: z.string(),
  at: z.string(),
});
export type ProposalReview = z.infer<typeof ProposalReview>;

export const TeamProposal = z.object({
  id: z.string().min(1),
  /** Slug of the opportunity the proposal answers. */
  opportunityId: z.string().nullable(),
  title: z.string(),
  brief: z.string(),
  noteForReviewer: z.string(),
  state: ProposalState,
  /** Increases by one on every resubmission after "changes requested". */
  version: z.number().int().min(1),
  createdBy: z.string(),
  createdByName: z.string(),
  submittedAt: z.string().nullable(),
  updatedAt: z.string(),
  seats: z.array(ProposalSeat),
  /** The decision on the CURRENT version, if there is one. */
  review: ProposalReview.nullable(),
});
export type TeamProposal = z.infer<typeof TeamProposal>;

export const SaveSeatInput = z.object({
  roleRequirementId: z.string().min(1).nullable().default(null),
  title: z.string().trim().min(1).max(80),
  capabilities: z.array(z.string().trim().min(1).max(60)).max(12),
  seniority: Seniority.nullable().default(null),
  allocation: z.number().gt(0).lte(1).default(1),
  /** The proposed person (slug) or null for an open seat. */
  personId: z.string().min(1).nullable().default(null),
}).strict();
export type SaveSeatInput = z.infer<typeof SaveSeatInput>;

/** Create or replace a DRAFT (or a "changes requested") proposal. Seats are replaced as a whole. State is never set here. */
export const SaveProposalInput = z.object({
  id: z.string().min(1).optional(),
  opportunityId: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  brief: z.string().trim().max(2000).default(""),
  noteForReviewer: z.string().trim().max(1000).default(""),
  seats: z.array(SaveSeatInput).min(1).max(12),
}).strict();
export type SaveProposalInput = z.infer<typeof SaveProposalInput>;

export const ReviewProposalInput = z.object({
  id: z.string().min(1),
  decision: ReviewDecision,
  note: z.string().trim().max(2000).default(""),
}).strict().refine((r) => r.decision === "approved" || r.note.length > 0, { message: "Explain your decision so the author knows what to do next.", path: ["note"] });
export type ReviewProposalInput = z.infer<typeof ReviewProposalInput>;

export const ConfirmSeatInput = z.object({
  seatId: z.string().min(1),
  startsOn: IsoDate,
  endsOn: IsoDate.nullable().default(null),
  availableFrom: IsoDate.nullable().default(null),
  allocation: z.number().gt(0).lte(1).nullable().default(null),
}).strict();
export type ConfirmSeatInput = z.infer<typeof ConfirmSeatInput>;

/** A confirmed engagement. Created only by a delivery lead confirming an approved proposal's seat. */
export const Assignment = z.object({
  id: z.string().min(1),
  personId: z.string().min(1),
  opportunityId: z.string().nullable(),
  projectName: z.string(),
  startsOn: IsoDate,
  /** Last day of the project; null = open-ended. */
  endsOn: IsoDate.nullable(),
  /** First day the person can be planned elsewhere. */
  availableFrom: IsoDate.nullable(),
  allocation: z.number().gt(0).lte(1),
  /** false = the end date is still pending confirmation. */
  endConfirmed: z.boolean(),
  deliveryLeadId: z.string(),
  deliveryLeadName: z.string(),
  proposalSeatId: z.string().nullable(),
});
export type Assignment = z.infer<typeof Assignment>;

/** A person raising their hand for a role of an opportunity. Separate from private career interests. Visible to staffing and the delivery lead only while shared. */
export const ExpressionOfInterest = z.object({
  id: z.string().min(1),
  personId: z.string().min(1),
  roleRequirementId: z.string().min(1),
  opportunityId: z.string().min(1),
  note: z.string(),
  status: z.enum(["shared", "withdrawn"]),
  createdAt: z.string(),
});
export type ExpressionOfInterest = z.infer<typeof ExpressionOfInterest>;

export const ExpressInterestInput = z.object({ roleRequirementId: z.string().min(1), note: z.string().trim().max(500).default("") }).strict();
export const WithdrawInterestInput = z.object({ roleRequirementId: z.string().min(1) }).strict();

/* ---------- Server-action inputs (validated at the boundary) ---------- */

export const ShortlistToggleInput = z.object({ personId: z.string().min(1) });

export const UpdateSummaryInput = z.object({ summary: z.string().trim().min(20, "Write at least 20 characters").max(600) });

/** Strict on purpose: a payload that tries to set `verification` (or anything else) is rejected, not ignored. */
export const AddSkillInput = z.object({
  label: z.string().trim().min(2).max(60),
  level: EvidenceLevel,
}).strict();

export const RemoveSkillInput = z.object({ evidenceId: z.string().min(1) }).strict();

export const SetInterestVisibilityInput = z.object({ interest: z.string().min(1), shared: z.boolean() }).strict();
export const SetWorkPreferencesVisibilityInput = z.object({ shared: z.boolean() }).strict();

export const AddExperienceInput = z.object({
  title: z.string().trim().min(3).max(120),
  role: z.string().trim().min(2).max(80),
  what: z.string().trim().min(10).max(600),
});

export const ToggleInterestInput = z.object({ interest: z.string().min(1) });

export const AssistantContext = z.enum(["home", "people", "passport", "mypassport", "opps", "role", "team", "planning", "insights", "me", "compare"]);
export type AssistantContext = z.infer<typeof AssistantContext>;

/**
 * Untrusted client input. Nothing in it is authoritative: the server resolves the user from the session and
 * authorizes the context, the suggestion and the subject (see features/ask-sparq/access.ts).
 */
/** A seat as the page currently shows it (Build a Team / Fill a Role / Compare). UNTRUSTED: people are re-authorized server-side. */
export const AssistantSeatContext = z.object({
  capabilities: z.array(z.string().trim().min(1).max(60)).max(12),
  personId: z.string().min(1).max(64).nullable().default(null),
}).strict();
export type AssistantSeatContext = z.infer<typeof AssistantSeatContext>;

export const AssistantRequest = z.object({
  context: AssistantContext,
  /** Either a suggestion id or free text. */
  promptId: z.string().max(64).optional(),
  question: z.string().trim().max(500).optional(),
  subjectPersonId: z.string().max(64).optional(),
  /** Page context (staff pages only; re-authorized in features/ask-sparq/access.ts): the opportunity slug the page is about. */
  opportunityId: z.string().max(64).optional(),
  /** Page context (role / team / compare / planning only): the seats on screen. */
  seats: z.array(AssistantSeatContext).max(12).optional(),
}).strict().refine((r) => r.promptId || r.question, { message: "promptId or question is required" });
export type AssistantRequest = z.infer<typeof AssistantRequest>;
