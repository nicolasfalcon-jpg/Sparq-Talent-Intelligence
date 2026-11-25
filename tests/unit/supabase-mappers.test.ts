import { describe, expect, it } from "vitest";
import { DomainRuleError, ForbiddenError, NotFoundError, UnauthenticatedError } from "@/domain/errors";
import { mapPgError } from "@/data/repositories/supabase/db";
import { isUuid } from "@/data/repositories/supabase/ids";
import {
  currentReview, interestNote, mapAssignment, mapAvailability, mapEoi, mapEvidence, mapInterests, mapOpportunity, mapPerson, mapProposal, mapSeat,
  mapUser, portraitFor, resolveRole,
} from "@/data/repositories/supabase/mappers";

describe("row → domain mappers", () => {
  it("evidence: source becomes `level`; a verified row carries the reviewer's name and date; a custom skill gets a custom id", () => {
    const verified = mapEvidence({ id: "e1", label: "Swift / SwiftUI", source: "professional", detail: "5 projects", verification: "verified", verified_at: "2026-11-12T09:00:00+00:00", capability: { slug: "swift" }, verifier: { display_name: "Rafael Ortiz" } }, "ana");
    expect(verified).toEqual({ id: "e1", personId: "ana", capabilityId: "swift", label: "Swift / SwiftUI", level: "professional", detail: "5 projects", verification: "verified", verifiedBy: "Rafael Ortiz", verifiedOn: "2026-11-12" });
    const custom = mapEvidence({ id: "e2", label: "Home Assistant", source: "emerging", detail: "", verification: "self_reported", capability: null }, "ana");
    expect(custom.capabilityId).toBe("custom:home-assistant");
    expect(custom).not.toHaveProperty("verifiedBy");
    expect(custom).not.toHaveProperty("verifiedOn");
  });

  it("a stamp on a row that is not verified is never surfaced", () => {
    const e = mapEvidence({ id: "e3", label: "Go", source: "training", detail: "", verification: "pending", verified_at: "2026-01-01", verifier: { display_name: "X" } }, "ana");
    expect(e).not.toHaveProperty("verifiedBy");
  });

  it("person: journey, certifications and preferences (only when the row is visible)", () => {
    const base = { slug: "ana", name: "Ana Ruiz", headline: "h", discipline: "Mobile", location: "Medellín", country: "Colombia", years_experience: 9, at_sparq_since: 2019, languages: ["English"], summary: "s", top_skills: ["Swift"], passport_groups: null };
    const withPref = mapPerson(base, { journey: [{ period_label: "2022 – now", role: "Senior", org: "Sparq", is_current: true }], certifications: [{ name: "AWS", issued_label: "2024" }], preference: { work_preferences: "Travel 20%", shared_with_staffing: true } });
    expect(withPref).toMatchObject({ id: "ana", yearsExperience: 9, atSparqSince: 2019, workPreferences: "Travel 20%", workPreferencesShared: true, journey: [{ when: "2022 – now", current: true }], certifications: [{ name: "AWS", date: "2024" }] });
    const hidden = mapPerson(base, { journey: [], certifications: [], preference: null });
    expect(hidden).not.toHaveProperty("workPreferences");
    expect(hidden).not.toHaveProperty("passportGroups");
  });

  it("availability resolves the delivery lead name and the proposed opportunity slug", () => {
    const row = { available_from: "2027-01-05", status: "pending", current_project: "Meridian", current_project_ends: "2026-12-19", delivery_lead_id: "u1", proposed_opportunity_id: "o1", proposed_from: "2027-01-12" };
    const a = mapAvailability(row, "ana", { leadName: (id) => (id === "u1" ? "Rafael Ortiz" : null), opportunitySlug: (id) => (id === "o1" ? "vela" : null) });
    expect(a).toEqual({ personId: "ana", availableFrom: "2027-01-05", status: "pending", currentProject: "Meridian", currentProjectEnds: "2026-12-19", deliveryLead: "Rafael Ortiz", proposedFor: { opportunityId: "vela", from: "2027-01-12" } });
    const unreadable = mapAvailability(row, "ana", { leadName: () => null, opportunitySlug: () => null });
    expect(unreadable.proposedFor).toBeNull();
  });

  it("interests: private rows are included for the owner; `shared` only lists selected AND shared labels", () => {
    expect(mapInterests("ana", [
      { interest: "AI engineering", selected: true, shared_with_staffing: true },
      { interest: "Platform", selected: true, shared_with_staffing: false },
      { interest: "Leadership", selected: false, shared_with_staffing: false },
    ])).toEqual({ personId: "ana", interests: { "AI engineering": true, Platform: true, Leadership: false }, shared: ["AI engineering"] });
  });

  it("seats: a seat with an assignment is confirmed; the database only knows open|proposed", () => {
    const base = { id: "s1", title: "AI Engineer", capabilities: ["LLM apps"], seniority: "Senior", allocation: "1", role: { slug: "vela-ai" } };
    expect(mapSeat({ ...base, person_id: null, person: null, assignment: null })).toMatchObject({ seatState: "open", personId: null, roleRequirementId: "vela-ai", allocation: 1, assignmentId: null });
    expect(mapSeat({ ...base, person_id: "p", person: { slug: "lucia" }, assignment: null })).toMatchObject({ seatState: "proposed", personId: "lucia" });
    expect(mapSeat({ ...base, person_id: "p", person: { slug: "lucia" }, assignment: [{ id: "a1" }] })).toMatchObject({ seatState: "confirmed", assignmentId: "a1" });
    expect(mapSeat({ ...base, person_id: "p", person: { slug: "lucia" }, assignment: { id: "a2" } })).toMatchObject({ assignmentId: "a2" });
  });

  it("proposal: the review shown is the one for the CURRENT version", () => {
    const reviews = [
      { proposal_version: 1, decision: "changes_requested", note: "Add QA", reviewer_id: "u9", created_at: "t1", reviewer: { display_name: "Rafael Ortiz" } },
      { proposal_version: 2, decision: "approved", note: null, reviewer_id: "u9", created_at: "t2", reviewer: { display_name: "Rafael Ortiz" } },
    ];
    expect(currentReview(1, reviews)).toMatchObject({ decision: "changes_requested", note: "Add QA" });
    expect(currentReview(2, reviews)).toMatchObject({ decision: "approved", note: null, reviewerName: "Rafael Ortiz" });
    expect(currentReview(3, reviews)).toBeNull();
    const p = mapProposal({ id: "p1", opportunity: { slug: "vela" }, title: "T", brief: null, note_for_reviewer: null, state: "submitted", version: 2, created_by: "u1", creator: { display_name: "Laura Gómez" }, submitted_at: "t", updated_at: "t", proposal_seats: [], proposal_reviews: reviews });
    expect(p).toMatchObject({ opportunityId: "vela", brief: "", noteForReviewer: "", createdByName: "Laura Gómez", review: { decision: "approved" } });
  });

  it("assignment and expression of interest", () => {
    expect(mapAssignment({ id: "a", person: { slug: "ana" }, opportunity: { slug: "vela" }, project_name: "Vela Bank", starts_on: "2027-01-12", ends_on: null, available_from: null, allocation: "0.5", end_confirmed: false, delivery_lead_id: "u", lead: { display_name: "Rafael Ortiz" }, proposal_seat_id: "s" }))
      .toEqual({ id: "a", personId: "ana", opportunityId: "vela", projectName: "Vela Bank", startsOn: "2027-01-12", endsOn: null, availableFrom: null, allocation: 0.5, endConfirmed: false, deliveryLeadId: "u", deliveryLeadName: "Rafael Ortiz", proposalSeatId: "s" });
    expect(mapEoi({ id: "i", person: { slug: "ana" }, role: { slug: "vela-mobile", opportunity: { slug: "vela" } }, status: "shared", note: null, created_at: "t" }))
      .toEqual({ id: "i", personId: "ana", roleRequirementId: "vela-mobile", opportunityId: "vela", note: "", status: "shared", createdAt: "t" });
    expect(mapEoi({ id: "i", person: { slug: "ana" }, role: null, status: "shared", created_at: "t" })).toBeNull();
  });

  it("opportunity: roles ordered, proposed person from the proposals map, delivery lead only when readable, derived interest note", () => {
    const r = { slug: "vela", client: "Vela Bank", client_initials: "VB", industry: "Fin", name: "n", short: "s", description: "d", status: "Staffing", kickoff: "2027-01-12", duration_months: 6, capabilities: ["x"],
      role_requirements: [{ slug: "vela-qa", sort_order: 2, title: "QA", capabilities: [] }, { slug: "vela-ai", sort_order: 1, title: "AI", capabilities: ["LLM"] }],
      opportunity_delivery_leads: [{ user_id: "u-r", lead: { display_name: "Rafael Ortiz" } }] };
    const o = mapOpportunity(r, { proposedByRole: new Map([["vela-ai", "lucia"]]), interestCount: 1 });
    expect(o.roles.map((x) => [x.id, x.proposedPersonId])).toEqual([["vela-ai", "lucia"], ["vela-qa", null]]);
    expect(o).toMatchObject({ deliveryLead: "Rafael Ortiz", deliveryLeadId: "u-r", interestNote: "1 engineer has expressed interest.", kickoff: "2027-01-12" });
    const engineerView = mapOpportunity({ ...r, opportunity_delivery_leads: [] }, { proposedByRole: new Map(), interestCount: 0 });
    expect(engineerView).toMatchObject({ deliveryLead: "", deliveryLeadId: null });
    expect(interestNote("Upcoming", 0)).toMatch(/not open/i);
  });
});

describe("one role per session", () => {
  it("priority is staffing_lead > delivery_lead > engineer > admin, and unknown roles are ignored", () => {
    expect(resolveRole(["engineer", "delivery_lead"])).toBe("delivery_lead");
    expect(resolveRole(["admin", "engineer"])).toBe("engineer");
    expect(resolveRole(["admin", "staffing_lead", "engineer"])).toBe("staffing_lead");
    expect(resolveRole(["admin"])).toBe("admin");
    expect(resolveRole(["superuser", "root"])).toBeNull();
    expect(resolveRole([])).toBeNull();
  });
  it("a user without any valid role has no session", () => {
    expect(mapUser({ id: "u", displayName: "X", title: "", roles: ["superuser"], personSlug: null })).toBeNull();
    expect(mapUser({ id: "u", displayName: "Ana Ruiz", title: "Senior", roles: ["engineer"], personSlug: "ana" })).toEqual({ id: "u", name: "Ana Ruiz", title: "Senior", role: "engineer", personId: "ana", portraitId: "ana" });
  });
  it("portrait key: the linked profile, else the first name without accents", () => {
    expect(portraitFor("ana", "Whoever")).toBe("ana");
    expect(portraitFor(null, "Inés Vidal")).toBe("ines");
    expect(portraitFor(null, "Admin Demo")).toBe("admin");
    expect(portraitFor(null, "  ")).toBe("admin");
  });
});

describe("Postgres / PostgREST error mapping", () => {
  it("42501 → ForbiddenError, hiding internal wording but keeping our own function messages", () => {
    const internal = mapPgError({ code: "42501", message: "permission denied for table app_users" });
    expect(internal).toBeInstanceOf(ForbiddenError);
    expect(internal.message).not.toMatch(/app_users/);
    expect(mapPgError({ code: "42501", message: "new row violates row-level security policy for table \"skill_evidence\"" }).message).not.toMatch(/skill_evidence/);
    expect(mapPgError({ code: "42501", message: "only the delivery lead assigned to this opportunity can confirm assignments" }).message).toMatch(/delivery lead/);
  });
  it("JWT problems → UnauthenticatedError; no rows → NotFoundError", () => {
    expect(mapPgError({ code: "PGRST301", message: "JWT expired" })).toBeInstanceOf(UnauthenticatedError);
    expect(mapPgError({ code: "PGRST116", message: "no rows" })).toBeInstanceOf(NotFoundError);
    expect(mapPgError({ code: "P0002", message: "proposal not found" })).toBeInstanceOf(NotFoundError);
  });
  it("business rules: transitions, capacity, duplicates, invalid input", () => {
    expect(mapPgError({ code: "55000", message: "a approved proposal cannot be submitted" })).toMatchObject({ name: "DomainRuleError", code: "invalid_transition" });
    expect(mapPgError({ code: "23514", message: "assignment exceeds the person's capacity (peak allocation 1.5)" })).toMatchObject({ code: "capacity_exceeded" });
    expect(mapPgError({ code: "23514", message: "violates check constraint" })).toMatchObject({ code: "invalid_input" });
    expect(mapPgError({ code: "23505", message: 'duplicate key value violates unique constraint "skill_evidence_unique_claim"' })).toMatchObject({ code: "duplicate_evidence" });
    expect(mapPgError({ code: "23505", message: 'duplicate key value violates unique constraint "proposal_seats_one_per_person"' })).toMatchObject({ code: "duplicate_person" });
    expect(mapPgError({ code: "23505", message: "this seat is already confirmed" })).toMatchObject({ code: "seat_already_confirmed" });
    expect(mapPgError({ code: "23505", message: "other" })).toMatchObject({ code: "already_exists" });
    expect(mapPgError({ code: "22P02", message: "invalid input syntax for type uuid" })).toBeInstanceOf(DomainRuleError);
  });
  it("anything unknown becomes an opaque error that does not echo the database message", () => {
    const e = mapPgError({ code: "XX000", message: "relation \"secret_table\" is broken" });
    expect(e.message).not.toMatch(/secret_table/);
  });
  it("uuid check", () => {
    expect(isUuid("6f1c2c4e-5b1d-4c7e-9a6b-3d2f0e8a7b11")).toBe(true);
    expect(isUuid("ana")).toBe(false);
    expect(isUuid("ana-ev-new-1")).toBe(false);
  });
});
