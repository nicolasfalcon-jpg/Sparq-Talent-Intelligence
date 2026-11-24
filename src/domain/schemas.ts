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
  deliveryLead: z.string(),
  capabilities: z.array(z.string()),
  interestNote: z.string(),
  roles: z.array(RoleRequirement).min(1),
});
export type Opportunity = z.infer<typeof Opportunity>;

export const UserRole = z.enum(["staffing_lead", "engineer"]);
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
export const AssistantRequest = z.object({
  context: AssistantContext,
  /** Either a suggestion id or free text. */
  promptId: z.string().max(64).optional(),
  question: z.string().trim().max(500).optional(),
  subjectPersonId: z.string().max(64).optional(),
}).strict().refine((r) => r.promptId || r.question, { message: "promptId or question is required" });
export type AssistantRequest = z.infer<typeof AssistantRequest>;
