/**
 * Pure row → domain mappers for the Supabase adapter. No I/O: the adapter selects EXPLICIT columns (with embedded slugs and
 * display names) and these functions shape them into the domain contracts in src/domain/schemas.ts.
 *
 * Naming differences between the database and the domain, in one place:
 *   skill_evidence.source          → SkillEvidence.level (the evidence SOURCE; the field kept its historical name)
 *   verified_by (user id)          → verifiedBy = that user's display name · verified_at → verifiedOn (YYYY-MM-DD)
 *   people.slug / capabilities.slug / opportunities.slug / role_requirements.slug → the domain ids
 *   capability_id null (custom skill) → capabilityId "custom:<slug of the label>"
 *   role_requirements.allocation / proposal_seats.allocation → a fraction of a full-time engagement (number)
 */
import type {
  AppUser, Assignment, Availability, Capability, CareerInterests, ExpressionOfInterest, Opportunity, Person, ProjectExperience, ProposalReview,
  ProposalSeat, SkillEvidence, TeamProposal, UserRole,
} from "@/domain/schemas";
import type { Row } from "./db";

export const str = (v: unknown): string => (v == null ? "" : String(v));
export const num = (v: unknown): number => Number(v);
export const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
/** PostgREST returns a to-one embed as an object, or as a one-element array depending on the relationship: accept both. */
export const embed = (v: unknown): Row | null => (Array.isArray(v) ? ((v[0] as Row | undefined) ?? null) : ((v as Row | null | undefined) ?? null));
export const embedList = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : v ? [v as Row] : []);
/** "2026-11-12T10:00:00+00:00" → "2026-11-12". Dates (YYYY-MM-DD) pass through. */
export const dateOnly = (v: unknown): string => str(v).slice(0, 10);

export const slugify = (label: string): string => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function mapCapability(r: Row): Capability {
  return { id: str(r.slug), name: str(r.name), group: str(r.grp) as Capability["group"], aliases: arr(r.aliases) };
}

export function mapEvidence(r: Row, personSlug: string): SkillEvidence {
  const cap = embed(r.capability);
  const verification = str(r.verification) as SkillEvidence["verification"];
  const out: SkillEvidence = {
    id: str(r.id), personId: personSlug, capabilityId: cap ? str(cap.slug) : `custom:${slugify(str(r.label))}`, label: str(r.label),
    level: str(r.source) as SkillEvidence["level"], detail: str(r.detail), verification,
  };
  if (verification === "verified") {
    const by = embed(r.verifier);
    if (by) out.verifiedBy = str(by.display_name);
    if (r.verified_at) out.verifiedOn = dateOnly(r.verified_at);
  }
  return out;
}

export function mapProject(r: Row, personSlug: string): ProjectExperience {
  const verification = str(r.verification) as ProjectExperience["verification"];
  const out: ProjectExperience = {
    id: str(r.id), personId: personSlug, period: str(r.period_label), client: str(r.client), role: str(r.role), title: str(r.title), summary: str(r.summary),
    tags: arr(r.tags), highlights: arr(r.highlights), verification,
  };
  if (r.client_category != null) out.clientCategory = str(r.client_category);
  if (verification === "verified") {
    const by = embed(r.verifier);
    if (by) out.verifiedBy = str(by.display_name);
    if (r.verified_at) out.verifiedOn = dateOnly(r.verified_at);
  }
  return out;
}

export function mapPerson(r: Row, extra: { journey: Row[]; certifications: Row[]; preference: Row | null }): Person {
  const person: Person = {
    id: str(r.slug), name: str(r.name), headline: str(r.headline), discipline: str(r.discipline) as Person["discipline"], location: str(r.location),
    yearsExperience: num(r.years_experience), languages: arr(r.languages), summary: str(r.summary), topSkills: arr(r.top_skills),
    journey: extra.journey.map((j) => ({ when: str(j.period_label), role: str(j.role), org: str(j.org), current: j.is_current === true })),
    certifications: extra.certifications.map((c) => ({ name: str(c.name), date: str(c.issued_label) })),
  };
  if (r.country != null) person.country = str(r.country);
  if (r.at_sparq_since != null) person.atSparqSince = num(r.at_sparq_since);
  if (Array.isArray(r.passport_groups)) person.passportGroups = r.passport_groups as NonNullable<Person["passportGroups"]>;
  // Row-level security decides whether this row is visible at all: owners see their own, staffing leads only rows shared with them.
  if (extra.preference) {
    person.workPreferences = str(extra.preference.work_preferences);
    person.workPreferencesShared = extra.preference.shared_with_staffing === true;
  }
  return person;
}

/** A row of `person_availability(as_of)` → Availability. Names and slugs are resolved by the caller (lookups below). */
export function mapAvailability(r: Row, personSlug: string, lookup: { leadName(id: string): string | null; opportunitySlug(id: string): string | null }): Availability {
  const leadId = r.delivery_lead_id == null ? null : str(r.delivery_lead_id);
  const oppSlug = r.proposed_opportunity_id == null ? null : lookup.opportunitySlug(str(r.proposed_opportunity_id));
  return {
    personId: personSlug, availableFrom: dateOnly(r.available_from), status: str(r.status) as Availability["status"],
    currentProject: r.current_project == null ? null : str(r.current_project),
    currentProjectEnds: r.current_project_ends == null ? null : dateOnly(r.current_project_ends),
    deliveryLead: leadId ? lookup.leadName(leadId) : null,
    proposedFor: oppSlug && r.proposed_from ? { opportunityId: oppSlug, from: dateOnly(r.proposed_from) } : null,
  };
}

/** Used when the database has no availability row for a visible person: free now, confirmed, nothing planned. */
export const idleAvailability = (personSlug: string, today: string): Availability => ({
  personId: personSlug, availableFrom: today, status: "confirmed", currentProject: null, currentProjectEnds: null, deliveryLead: null, proposedFor: null,
});

/** career_interests rows of ONE person → the domain shape. For a non-owner the rows are already limited to shared ones. */
export function mapInterests(personSlug: string, rows: Row[]): CareerInterests {
  const interests: Record<string, boolean> = {};
  const shared: string[] = [];
  for (const r of rows) {
    interests[str(r.interest)] = r.selected === true;
    if (r.selected === true && r.shared_with_staffing === true) shared.push(str(r.interest));
  }
  return { personId: personSlug, interests, shared };
}

export function mapAssignment(r: Row): Assignment {
  const person = embed(r.person), opp = embed(r.opportunity), lead = embed(r.lead);
  return {
    id: str(r.id), personId: person ? str(person.slug) : "", opportunityId: opp ? str(opp.slug) : null, projectName: str(r.project_name),
    startsOn: dateOnly(r.starts_on), endsOn: r.ends_on == null ? null : dateOnly(r.ends_on), availableFrom: r.available_from == null ? null : dateOnly(r.available_from),
    allocation: num(r.allocation), endConfirmed: r.end_confirmed === true, deliveryLeadId: str(r.delivery_lead_id), deliveryLeadName: lead ? str(lead.display_name) : "",
    proposalSeatId: r.proposal_seat_id == null ? null : str(r.proposal_seat_id),
  };
}

export function mapSeat(r: Row): ProposalSeat {
  const person = embed(r.person), role = embed(r.role), assignment = embed(r.assignment);
  const assignmentId = assignment ? str(assignment.id) : null;
  return {
    id: str(r.id), roleRequirementId: role ? str(role.slug) : null, title: str(r.title), capabilities: arr(r.capabilities),
    seniority: r.seniority == null ? null : (str(r.seniority) as ProposalSeat["seniority"]), allocation: num(r.allocation),
    personId: person ? str(person.slug) : null,
    // The database has only open|proposed. A seat that became an assignment is "confirmed".
    seatState: assignmentId ? "confirmed" : r.person_id == null ? "open" : "proposed", assignmentId,
  };
}

/** The review of the CURRENT version of a proposal, if the reviewer has decided it. */
export function currentReview(version: number, reviews: Row[]): ProposalReview | null {
  const r = reviews.find((x) => num(x.proposal_version) === version);
  if (!r) return null;
  const reviewer = embed(r.reviewer);
  return {
    decision: str(r.decision) as ProposalReview["decision"], note: r.note == null ? null : str(r.note), reviewerId: str(r.reviewer_id),
    reviewerName: reviewer ? str(reviewer.display_name) : "", at: str(r.created_at),
  };
}

export function mapProposal(r: Row): TeamProposal {
  const opp = embed(r.opportunity), creator = embed(r.creator);
  const version = num(r.version);
  const seats = embedList(r.proposal_seats).map(mapSeat); // order comes from the query (position)
  return {
    id: str(r.id), opportunityId: opp ? str(opp.slug) : null, title: str(r.title), brief: str(r.brief), noteForReviewer: str(r.note_for_reviewer),
    state: str(r.state) as TeamProposal["state"], version, createdBy: str(r.created_by), createdByName: creator ? str(creator.display_name) : "",
    submittedAt: r.submitted_at == null ? null : str(r.submitted_at), updatedAt: str(r.updated_at), seats, review: currentReview(version, embedList(r.proposal_reviews)),
  };
}

export function mapEoi(r: Row): ExpressionOfInterest | null {
  const person = embed(r.person), role = embed(r.role);
  const opp = role ? embed(role.opportunity) : null;
  if (!person || !role || !opp) return null; // a role the viewer can no longer read cannot be placed in the domain
  return {
    id: str(r.id), personId: str(person.slug), roleRequirementId: str(role.slug), opportunityId: str(opp.slug), note: str(r.note),
    status: str(r.status) as ExpressionOfInterest["status"], createdAt: str(r.created_at),
  };
}

/**
 * One role per session. A user MAY hold several roles in the database; the application resolves a single one with this fixed
 * priority: staffing_lead > delivery_lead > engineer > admin. Roles outside the enum are ignored; no valid role = no session.
 */
const ROLE_PRIORITY: readonly UserRole[] = ["staffing_lead", "delivery_lead", "engineer", "admin"];
export function resolveRole(roles: readonly unknown[]): UserRole | null {
  return ROLE_PRIORITY.find((r) => roles.includes(r)) ?? null;
}

/** Portrait key: the linked profile's slug, else the first name, lowercased and without accents ("Inés Vidal" → "ines"). */
export function portraitFor(personSlug: string | null, displayName: string): string {
  if (personSlug) return personSlug;
  const first = displayName.trim().split(/\s+/)[0] ?? "";
  return first.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() || "admin";
}

export function mapUser(input: { id: string; displayName: string; title: string; roles: readonly unknown[]; personSlug: string | null }): AppUser | null {
  const role = resolveRole(input.roles);
  if (!role) return null;
  return { id: input.id, name: input.displayName, title: input.title, role, personId: input.personSlug, portraitId: portraitFor(input.personSlug, input.displayName) };
}

/** Opportunity from its row + readable embeds. `proposedByRole` = role slug → proposed person slug (from submitted/approved proposals). */
export function mapOpportunity(r: Row, extra: { proposedByRole: Map<string, string>; interestCount: number }): Opportunity {
  const leads = embedList(r.opportunity_delivery_leads);
  const lead = leads[0] ? embed(leads[0].lead) : null;
  const status = str(r.status) as Opportunity["status"];
  const roles = embedList(r.role_requirements)
    .sort((a, b) => num(a.sort_order) - num(b.sort_order))
    .map((rr) => ({ id: str(rr.slug), title: str(rr.title), capabilities: arr(rr.capabilities), proposedPersonId: extra.proposedByRole.get(str(rr.slug)) ?? null }));
  return {
    id: str(r.slug), client: str(r.client), clientInitials: str(r.client_initials), industry: str(r.industry), name: str(r.name), short: str(r.short),
    description: str(r.description), status, kickoff: dateOnly(r.kickoff), durationMonths: num(r.duration_months),
    deliveryLead: lead ? str(lead.display_name) : "", deliveryLeadId: leads[0] ? str(leads[0].user_id) : null, capabilities: arr(r.capabilities),
    interestNote: interestNote(status, extra.interestCount), roles,
  };
}

/** Derived, not stored: the database holds no free-text note. Counts only the expressions the viewer is allowed to see. */
export function interestNote(status: Opportunity["status"], count: number): string {
  if (count > 0) return count === 1 ? "1 engineer has expressed interest." : `${count} engineers have expressed interest.`;
  return status === "Upcoming" ? "Not open to expressions of interest yet." : "No expressions of interest yet.";
}
