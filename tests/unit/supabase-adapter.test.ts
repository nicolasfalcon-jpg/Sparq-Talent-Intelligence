/**
 * The Supabase adapter against a FAKE client. This verifies query construction (explicit columns, the right tables and RPCs),
 * mapping, error handling and that every call goes through the injected request-scoped client. It cannot verify RLS, grants,
 * triggers, PostgREST embedding behaviour or real tokens: those are covered only by the remote integration tests (tests/remote).
 */
import { describe, expect, it, vi } from "vitest";
import { DomainRuleError, ForbiddenError, NotFoundError } from "@/domain/errors";
import type { Actor } from "@/domain/policy";
import { createClock, createRepositoriesWith } from "@/data/repositories/supabase/index";
import { createFakeDb, type Call, type Handler } from "./supabase-fake-db";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ANA = U(1), LUCIA = U(2), PROP = U(10), SEAT = U(11), OPP = U(20), ROLE = U(21);
const viewer: Actor = { id: "viewer-id-xyz", role: "staffing_lead", personId: null };

function setup(handler: Handler) {
  const fake = createFakeDb(handler);
  const getDb = vi.fn(async () => fake.db);
  return { repos: createRepositoriesWith(getDb, { today: () => "2026-11-24" }), calls: fake.calls, getDb };
}
const noStarSelects = (calls: Call[]) => {
  for (const c of calls) for (const cols of [c.columns, c.returning]) if (cols !== undefined) expect(cols).not.toMatch(/(^|[ ,(])\*/);
};
const peopleHandler: Handler = (c) => {
  switch (`${c.op}:${c.table}`) {
    case "select:people": return { data: [{ id: ANA, slug: "ana", name: "Ana Ruiz", headline: "h", discipline: "Mobile", location: "Medellín", country: "Colombia", years_experience: 9, at_sparq_since: 2019, languages: [], summary: "s", top_skills: ["Swift"], passport_groups: null }] };
    case "select:skill_evidence": return { data: [{ id: U(30), person_id: ANA, label: "Swift", source: "professional", detail: "d", verification: "verified", verified_at: "2026-11-12T00:00:00Z", capability: { slug: "swift" }, verifier: { display_name: "Rafael Ortiz" } }] };
    case "select:career_journey_entries": return { data: [{ person_id: ANA, position: 1, period_label: "2022 – now", role: "Senior", org: "Sparq", is_current: true }] };
    case "select:certifications": return { data: [] };
    case "select:person_preferences": return { data: [] };
    case "rpc:person_availability": return { data: [{ person_id: ANA, available_from: "2027-01-05", status: "confirmed", free_capacity: 1, current_project: "Meridian", current_project_ends: "2026-12-19", delivery_lead_id: U(5), proposed_opportunity_id: OPP, proposed_from: "2027-01-12" }] };
    case "select:app_users": return { data: [{ id: U(5), display_name: "Rafael Ortiz" }] };
    case "select:opportunities": return { data: [{ id: OPP, slug: "vela" }] };
  }
};

describe("talent", () => {
  it("builds a person aggregate with explicit columns, availability from person_availability(as_of = the clock) and slug ids", async () => {
    const { repos, calls } = setup(peopleHandler);
    const agg = await repos.talent.getPerson("ana");
    expect(agg?.person).toMatchObject({ id: "ana", journey: [{ current: true }] });
    expect(agg?.evidence[0]).toMatchObject({ personId: "ana", capabilityId: "swift", level: "professional", verification: "verified", verifiedBy: "Rafael Ortiz", verifiedOn: "2026-11-12" });
    expect(agg?.availability).toEqual({ personId: "ana", availableFrom: "2027-01-05", status: "confirmed", currentProject: "Meridian", currentProjectEnds: "2026-12-19", deliveryLead: "Rafael Ortiz", proposedFor: { opportunityId: "vela", from: "2027-01-12" } });
    expect(calls.find((c) => c.op === "rpc")).toMatchObject({ table: "person_availability", values: { as_of: "2026-11-24" } });
    expect(calls.find((c) => c.table === "people")?.filters).toContainEqual(["eq", "slug", "ana"]);
    noStarSelects(calls);
  });

  it("an unknown person is null, and a person without an availability row is idle (free now), never missing", async () => {
    const { repos } = setup((c) => (c.table === "people" ? { data: [] } : undefined));
    expect(await repos.talent.getPerson("nobody")).toBeNull();
    const { repos: r2 } = setup((c) => (c.table === "rpc" || c.op === "rpc" ? { data: [] } : peopleHandler(c)));
    expect((await r2.talent.getPerson("ana"))?.availability).toMatchObject({ availableFrom: "2026-11-24", status: "confirmed", currentProject: null });
  });

  it("addSkill writes ONLY the owner-writable columns: verification metadata can never be sent", async () => {
    const { repos, calls } = setup((c) => {
      if (c.op === "select" && c.table === "people") return { data: [{ id: ANA, slug: "ana" }] };
      if (c.op === "select" && c.table === "capabilities") return { data: [{ id: U(40), slug: "swift", name: "Swift", grp: "mobile", aliases: ["native ios"] }] };
      if (c.op === "insert") return { data: { id: U(31), label: "Swift", source: "independent", detail: "x", verification: "self_reported", capability: { slug: "swift" } } };
    });
    const created = await repos.talent.addSkill("ana", { label: "Swift", level: "independent" });
    const insert = calls.find((c) => c.op === "insert")!;
    expect(Object.keys(insert.values as object).sort()).toEqual(["capability_id", "detail", "label", "person_id", "source"]);
    expect(created).toMatchObject({ verification: "self_reported", level: "independent" });
    expect(created).not.toHaveProperty("verifiedBy");
  });

  it("addSkill refuses a duplicate with the domain rule before touching the database", async () => {
    const { repos, calls } = setup((c) => {
      if (c.op === "select" && c.table === "people") return { data: [{ id: ANA, slug: "ana" }] };
      if (c.op === "select" && c.table === "capabilities") return { data: [{ id: U(40), slug: "swift", name: "Swift", grp: "mobile", aliases: [] }] };
      if (c.op === "select" && c.table === "skill_evidence") return { data: [{ id: U(30), label: "Swift", source: "independent", detail: "", verification: "self_reported", capability: { slug: "swift" } }] };
    });
    await expect(repos.talent.addSkill("ana", { label: "Swift", level: "independent" })).rejects.toMatchObject({ code: "duplicate_evidence" });
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("removeSkill: verified evidence is locked (no delete is sent); a missing row is false; a delete that matches nothing is locked too", async () => {
    const locked = setup((c) => {
      if (c.table === "people") return { data: [{ id: ANA, slug: "ana" }] };
      if (c.table === "skill_evidence" && c.op === "select") return { data: { id: U(30), label: "Swift", verification: "verified" } };
    });
    await expect(locked.repos.talent.removeSkill("ana", U(30))).rejects.toMatchObject({ name: "DomainRuleError", code: "evidence_locked" });
    expect(locked.calls.some((c) => c.op === "delete")).toBe(false);

    const missing = setup((c) => (c.table === "people" ? { data: [{ id: ANA, slug: "ana" }] } : undefined));
    expect(await missing.repos.talent.removeSkill("ana", U(30))).toBe(false);
    expect(await missing.repos.talent.removeSkill("ana", "ana-ev-new-1")).toBe(false); // not a uuid: cannot exist

    const raced = setup((c) => {
      if (c.table === "people") return { data: [{ id: ANA, slug: "ana" }] };
      if (c.op === "select") return { data: { id: U(30), label: "Swift", verification: "pending" } };
      if (c.op === "delete") return { data: [] };
    });
    await expect(raced.repos.talent.removeSkill("ana", U(30))).rejects.toBeInstanceOf(DomainRuleError);
  });

  it("an update that matches no row is a ForbiddenError (RLS says it is not the caller's profile)", async () => {
    const { repos } = setup((c) => (c.op === "select" && c.table === "people" ? { data: [{ id: LUCIA, slug: "lucia" }] } : c.op === "update" ? { data: [] } : undefined));
    await expect(repos.talent.updateSummary("lucia", "x".repeat(30))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("interests: only the owner-writable columns are written; sharing needs a selected interest", async () => {
    const { repos, calls } = setup((c) => {
      if (c.table === "people") return { data: [{ id: ANA, slug: "ana" }] };
      if (c.op === "select" && c.table === "career_interests" && c.single) return { data: null };
      if (c.op === "select" && c.table === "career_interests") return { data: [{ interest: "AI", selected: true, shared_with_staffing: false }] };
    });
    const r = await repos.talent.toggleInterest("ana", "AI");
    expect(calls.find((c) => c.op === "insert")?.values).toEqual({ person_id: ANA, interest: "AI", selected: true });
    expect(r.interests).toEqual({ AI: true });
    await expect(repos.talent.setInterestShared("ana", "AI", true)).rejects.toMatchObject({ code: "interest_not_selected" });
  });
});

describe("opportunities", () => {
  it("maps roles, delivery lead, and the proposed person of the LATEST submitted/approved proposal", async () => {
    const { repos, calls } = setup((c) => {
      if (c.table === "opportunities") return { data: [{ id: OPP, slug: "vela", client: "Vela Bank", client_initials: "VB", industry: "Fin", name: "n", short: "s", description: "d", status: "Staffing", kickoff: "2027-01-12", duration_months: 6, capabilities: [],
        role_requirements: [{ id: ROLE, slug: "vela-ai", sort_order: 1, title: "AI Engineer", capabilities: ["LLM apps"] }], opportunity_delivery_leads: [{ user_id: U(5), lead: { display_name: "Rafael Ortiz" } }] }] };
      if (c.table === "proposal_seats") return { data: [
        { role_requirement_id: ROLE, person: { slug: "ana" }, proposal: { state: "submitted", submitted_at: "2026-11-01" } },
        { role_requirement_id: ROLE, person: { slug: "lucia" }, proposal: { state: "approved", submitted_at: "2026-11-10" } },
      ] };
      if (c.table === "expressions_of_interest") return { data: [{ role_requirement_id: ROLE, status: "shared" }] };
    });
    const [o] = await repos.opportunities.list();
    expect(o).toMatchObject({ id: "vela", deliveryLead: "Rafael Ortiz", deliveryLeadId: U(5), interestNote: "1 engineer has expressed interest." });
    expect(o!.roles[0]).toMatchObject({ id: "vela-ai", proposedPersonId: "lucia" });
    const seatQuery = calls.find((c) => c.table === "proposal_seats")!;
    expect(seatQuery.filters).toContainEqual(["in", "proposal.state", ["submitted", "approved"]]);
    noStarSelects(calls);
    expect(await setup(() => ({ data: [] })).repos.opportunities.get("nope")).toBeNull();
  });
});

const proposalRow = (over: Record<string, unknown> = {}) => ({ id: PROP, opportunity: { slug: "vela" }, title: "T", brief: "", note_for_reviewer: "", state: "draft", version: 1, created_by: U(3), creator: { display_name: "Laura Gómez" }, submitted_at: null, updated_at: "t",
  proposal_seats: [{ id: SEAT, role_requirement_id: ROLE, role: { slug: "vela-ai" }, position: 0, title: "AI", capabilities: ["LLM"], seniority: "Senior", allocation: 1, person_id: LUCIA, person: { slug: "lucia" }, seat_state: "proposed", assignment: null }], proposal_reviews: [], ...over });

describe("proposals", () => {
  const input = { opportunityId: "vela", title: "T", brief: "", noteForReviewer: "", seats: [{ roleRequirementId: "vela-ai", title: "AI", capabilities: ["LLM"], seniority: "Senior" as const, allocation: 1, personId: "lucia" }] };
  const resolver: Handler = (c) => {
    if (c.op === "select" && c.table === "opportunities") return { data: [{ id: OPP, slug: "vela" }] };
    if (c.op === "select" && c.table === "people") return { data: [{ id: LUCIA, slug: "lucia" }] };
    if (c.op === "select" && c.table === "role_requirements") return { data: [{ id: ROLE, slug: "vela-ai" }] };
  };

  it("a new draft is created with only the writable header columns, then its seats; a seat failure removes the empty draft", async () => {
    const ok = setup((c) => resolver(c) ?? (c.op === "insert" && c.table === "team_proposals" ? { data: { id: PROP } } : c.op === "select" && c.table === "team_proposals" ? { data: proposalRow() } : undefined));
    const saved = await ok.repos.proposals.save("u", input);
    expect(Object.keys(ok.calls.find((c) => c.op === "insert" && c.table === "team_proposals")!.values as object).sort()).toEqual(["brief", "note_for_reviewer", "opportunity_id", "title"]);
    const seat = (ok.calls.find((c) => c.op === "insert" && c.table === "proposal_seats")!.values as Record<string, unknown>[])[0]!;
    expect(seat).toMatchObject({ proposal_id: PROP, role_requirement_id: ROLE, person_id: LUCIA, seat_state: "proposed", position: 0 });
    expect(saved).toMatchObject({ id: PROP, state: "draft", opportunityId: "vela", seats: [{ personId: "lucia", seatState: "proposed" }] });

    const bad = setup((c) => resolver(c) ?? (c.op === "insert" && c.table === "team_proposals" ? { data: { id: PROP } } : c.op === "insert" && c.table === "proposal_seats" ? { error: { code: "23505", message: "proposal_seats_one_per_person" } } : undefined));
    await expect(bad.repos.proposals.save("u", input)).rejects.toMatchObject({ code: "duplicate_person" });
    expect(bad.calls.some((c) => c.op === "delete" && c.table === "team_proposals")).toBe(true);
  });

  it("editing restores the previous seats when the new ones cannot be written", async () => {
    const seatInserts: Call[] = [];
    const { repos, calls } = setup((c) => {
      const r = resolver(c); if (r) return r;
      if (c.op === "select" && c.table === "team_proposals") return { data: proposalRow() };
      if (c.op === "select" && c.table === "proposal_seats") return { data: [{ role_requirement_id: ROLE, position: 0, title: "OLD", capabilities: [], seniority: null, allocation: 1, person_id: null, seat_state: "open" }] };
      if (c.op === "update" && c.table === "team_proposals") return { data: [{ id: PROP }] };
      if (c.op === "insert" && c.table === "proposal_seats") { seatInserts.push(c); return seatInserts.length === 1 ? { error: { code: "23514", message: "check" } } : { data: [] }; }
    });
    await expect(repos.proposals.save("u", { ...input, id: PROP })).rejects.toBeInstanceOf(DomainRuleError);
    expect(seatInserts).toHaveLength(2);
    expect((seatInserts[1]!.values as Record<string, unknown>[])[0]).toMatchObject({ title: "OLD", proposal_id: PROP });
    expect(calls.filter((c) => c.op === "delete" && c.table === "proposal_seats")).toHaveLength(2);
  });

  it("a submitted proposal can no longer be edited (rule checked before any write)", async () => {
    const { repos, calls } = setup((c) => resolver(c) ?? (c.op === "select" && c.table === "team_proposals" ? { data: proposalRow({ state: "submitted" }) } : undefined));
    await expect(repos.proposals.save("u", { ...input, id: PROP })).rejects.toMatchObject({ code: "proposal_not_editable" });
    expect(calls.some((c) => c.op === "delete" || c.op === "update" || c.op === "insert")).toBe(false);
  });

  it("lifecycle goes through the SQL functions with the documented arguments", async () => {
    const { repos, calls } = setup((c) => (c.op === "select" && c.table === "team_proposals" ? { data: proposalRow({ state: "submitted" }) } : undefined));
    await repos.proposals.submit("u", PROP, "  please review  ");
    await repos.proposals.withdraw("u", PROP);
    await repos.proposals.review("u", PROP, "changes_requested", "Add QA");
    await repos.proposals.review("u", PROP, "approved");
    const rpcs = calls.filter((c) => c.op === "rpc").map((c) => [c.table, c.values]);
    expect(rpcs).toEqual([
      ["submit_proposal", { p_id: PROP, p_note: "please review" }],
      ["withdraw_proposal", { p_id: PROP }],
      ["review_proposal", { p_id: PROP, p_decision: "changes_requested", p_note: "Add QA" }],
      ["review_proposal", { p_id: PROP, p_decision: "approved", p_note: null }],
    ]);
    // Never a direct table write of state.
    expect(calls.some((c) => c.op === "update" && c.table === "team_proposals")).toBe(false);
  });

  it("database denials surface as typed errors", async () => {
    const forbidden = setup((c) => (c.op === "rpc" ? { error: { code: "42501", message: "only the delivery lead assigned to this opportunity can review it" } } : undefined));
    await expect(forbidden.repos.proposals.review("u", PROP, "approved")).rejects.toBeInstanceOf(ForbiddenError);
    const state = setup((c) => (c.op === "rpc" ? { error: { code: "55000", message: "a draft proposal cannot be reviewed" } } : undefined));
    await expect(state.repos.proposals.review("u", PROP, "approved")).rejects.toMatchObject({ code: "invalid_transition" });
    const capacity = setup((c) => (c.op === "rpc" ? { error: { code: "23514", message: "assignment exceeds the person's capacity (peak allocation 1.5)" } } : undefined));
    await expect(capacity.repos.proposals.confirmSeat("u", { seatId: SEAT, startsOn: "2027-01-12", endsOn: null, availableFrom: null, allocation: null })).rejects.toMatchObject({ code: "capacity_exceeded" });
    await expect(setup(() => undefined).repos.proposals.submit("u", "not-a-uuid")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("confirmSeat calls confirm_assignment and returns the mapped assignment", async () => {
    const { repos, calls } = setup((c) => {
      if (c.op === "rpc") return { data: U(50) };
      if (c.table === "assignments") return { data: { id: U(50), person: { slug: "lucia" }, opportunity: { slug: "vela" }, project_name: "Vela Bank", starts_on: "2027-01-12", ends_on: null, available_from: null, allocation: 1, end_confirmed: false, delivery_lead_id: U(5), lead: { display_name: "Rafael Ortiz" }, proposal_seat_id: SEAT } };
    });
    const a = await repos.proposals.confirmSeat("u", { seatId: SEAT, startsOn: "2027-01-12", endsOn: null, availableFrom: null, allocation: 0.5 });
    expect(calls.find((c) => c.op === "rpc")).toMatchObject({ table: "confirm_assignment", values: { p_seat_id: SEAT, p_starts_on: "2027-01-12", p_allocation: 0.5 } });
    expect(a).toMatchObject({ id: U(50), personId: "lucia", deliveryLeadName: "Rafael Ortiz", proposalSeatId: SEAT });
  });

  it("list/get scope nothing client-side: RLS decides (the viewer is not sent to the database)", async () => {
    const { repos, calls } = setup((c) => (c.table === "team_proposals" ? { data: [proposalRow()] } : undefined));
    expect(await repos.proposals.list(viewer)).toHaveLength(1);
    expect(await repos.proposals.get(viewer, "nope")).toBeNull();
    expect(JSON.stringify(calls)).not.toContain(viewer.id);
  });
});

describe("directory (the session user)", () => {
  const identity = (roles: string[], person: string | null = null) => ({ user_id: U(3), display_name: "Laura Gómez", person_id: person, roles });
  it("builds the AppUser from my_identity, with the role resolved by priority and the person as a SLUG", async () => {
    const { repos } = setup((c) => {
      if (c.op === "rpc") return { data: identity(["engineer", "delivery_lead"], ANA) };
      if (c.table === "app_users") return { data: { title: "QA Lead" } };
      if (c.table === "people") return { data: { slug: "camila" } };
    });
    expect(await repos.directory.getCurrentUser()).toEqual({ id: U(3), name: "Laura Gómez", title: "QA Lead", role: "delivery_lead", personId: "camila", portraitId: "camila" });
  });
  it("no session (anon cannot call my_identity), no row, or no role → null; it never throws for 'not signed in'", async () => {
    expect(await setup((c) => (c.op === "rpc" ? { error: { code: "42501", message: "permission denied for function my_identity" } } : undefined)).repos.directory.getCurrentUser()).toBeNull();
    expect(await setup((c) => (c.op === "rpc" ? { error: { code: "PGRST301", message: "JWT expired" } } : undefined)).repos.directory.getCurrentUser()).toBeNull();
    expect(await setup((c) => (c.op === "rpc" ? { data: null } : undefined)).repos.directory.getCurrentUser()).toBeNull();
    expect(await setup((c) => (c.op === "rpc" ? { data: identity([]) } : c.table === "app_users" ? { data: { title: "" } } : undefined)).repos.directory.getCurrentUser()).toBeNull();
  });
  it("unexpected database failures are not hidden as 'signed out'", async () => {
    const { repos } = setup((c) => (c.op === "rpc" ? { error: { code: "XX000", message: "boom" } } : undefined));
    await expect(repos.directory.getCurrentUser()).rejects.toThrow();
  });
  it("the identity is asked once per client (request), not once per call", async () => {
    const { repos, calls } = setup((c) => (c.op === "rpc" ? { data: identity(["admin"]) } : c.table === "app_users" ? { data: { title: "Administrator" } } : undefined));
    await repos.directory.getCurrentUser(); await repos.directory.getCurrentUser();
    expect(calls.filter((c) => c.op === "rpc")).toHaveLength(1);
  });
  it("the demo persona does not exist here, and there are no notifications table yet", async () => {
    const { repos } = setup(() => undefined);
    await expect(repos.directory.getUserByRole("engineer")).rejects.toThrow(/memory mode/);
    expect(await repos.directory.listNotifications("engineer")).toEqual([]);
  });
});

describe("planning, interests, shortlists", () => {
  it("assignments are read as the caller (no client-side scoping) and mapped", async () => {
    const { repos, calls } = setup((c) => (c.table === "assignments" ? { data: [{ id: U(50), person: { slug: "ana" }, opportunity: null, project_name: "Meridian", starts_on: "2025-01-06", ends_on: "2026-12-19", available_from: "2027-01-05", allocation: 1, end_confirmed: true, delivery_lead_id: U(5), lead: { display_name: "Rafael" }, proposal_seat_id: null }] } : undefined));
    expect(await repos.planning.listAssignments(viewer)).toEqual([expect.objectContaining({ personId: "ana", opportunityId: null, endsOn: "2026-12-19", availableFrom: "2027-01-05", endConfirmed: true })]);
    noStarSelects(calls);
  });
  it("expressing interest inserts only the writable columns; a re-share after withdrawal is an update", async () => {
    const eoi = { id: U(60), person: { slug: "ana" }, role: { slug: "vela-mobile", opportunity: { slug: "vela" } }, status: "shared", note: "hi", created_at: "t" };
    const fresh = setup((c) => {
      if (c.table === "people") return { data: [{ id: ANA, slug: "ana" }] };
      if (c.table === "role_requirements") return { data: [{ id: ROLE, slug: "vela-mobile" }] };
      if (c.op === "select" && c.table === "expressions_of_interest") return { data: null };
      if (c.op === "insert") return { data: [eoi] };
    });
    expect((await fresh.repos.interests.express("ana", "vela-mobile", "hi")).status).toBe("shared");
    expect(fresh.calls.find((c) => c.op === "insert")?.values).toEqual({ person_id: ANA, role_requirement_id: ROLE, note: "hi" });
    const again = setup((c) => {
      if (c.table === "people") return { data: [{ id: ANA, slug: "ana" }] };
      if (c.table === "role_requirements") return { data: [{ id: ROLE, slug: "vela-mobile" }] };
      if (c.op === "select" && c.table === "expressions_of_interest") return { data: { id: U(60), status: "withdrawn" } };
      if (c.op === "update") return { data: [eoi] };
    });
    await again.repos.interests.express("ana", "vela-mobile", "hi");
    expect(again.calls.find((c) => c.op === "update")?.values).toEqual({ status: "shared", note: "hi" });
    expect(again.calls.some((c) => c.op === "insert")).toBe(false);
  });
  it("withdrawing an expression that does not exist is NotFound", async () => {
    const { repos } = setup((c) => (c.table === "people" ? { data: [{ id: ANA, slug: "ana" }] } : c.table === "role_requirements" ? { data: [{ id: ROLE, slug: "r" }] } : c.op === "update" ? { data: [] } : undefined));
    await expect(repos.interests.withdraw("ana", "r")).rejects.toBeInstanceOf(NotFoundError);
  });
  it("shortlist toggle adds then removes, always for the given owner, and returns slugs", async () => {
    let has = false;
    const { repos, calls } = setup((c) => {
      if (c.table === "people") return { data: [{ id: ANA, slug: "ana" }] };
      if (c.op === "select" && c.single) return { data: has ? { person_id: ANA } : null };
      if (c.op === "select") return { data: has ? [{ person: { slug: "ana" } }] : [] };
      if (c.op === "insert") { has = true; return { data: [] }; }
      if (c.op === "delete") { has = false; return { data: [] }; }
    });
    expect(await repos.shortlists.toggle(U(3), "ana")).toEqual(["ana"]);
    expect(await repos.shortlists.toggle(U(3), "ana")).toEqual([]);
    expect(calls.find((c) => c.op === "insert")?.values).toEqual({ owner_id: U(3), person_id: ANA });
  });
});

describe("clock", () => {
  it("is the demo dataset's date unless SPARQ_TODAY is a valid date", () => {
    expect(createClock({}).today()).toBe("2026-11-24");
    expect(createClock({ SPARQ_TODAY: "2027-02-01" }).today()).toBe("2027-02-01");
    expect(createClock({ SPARQ_TODAY: "tomorrow" }).today()).toBe("2026-11-24");
  });
});

describe("request scoping", () => {
  it("every repository method asks for the client at call time (no cached or privileged connection)", async () => {
    const { repos, getDb } = setup(() => undefined);
    const dummy = { id: "x", role: "staffing_lead", personId: null } as Actor;
    const calls: [string, () => Promise<unknown>][] = [
      ["talent.listCapabilities", () => repos.talent.listCapabilities()], ["talent.listPeople", () => repos.talent.listPeople()], ["talent.getPerson", () => repos.talent.getPerson("a")],
      ["talent.listProjects", () => repos.talent.listProjects("a")], ["talent.getCareerInterests", () => repos.talent.getCareerInterests("a")], ["talent.getSharedInterests", () => repos.talent.getSharedInterests("a")],
      ["talent.updateSummary", () => repos.talent.updateSummary("a", "x")], ["talent.addSkill", () => repos.talent.addSkill("a", { label: "Swift", level: "training" })],
      ["talent.removeSkill", () => repos.talent.removeSkill("a", U(1))], ["talent.addProject", () => repos.talent.addProject("a", { title: "t", role: "r", what: "w", period: "p" })],
      ["talent.toggleInterest", () => repos.talent.toggleInterest("a", "i")], ["talent.setInterestShared", () => repos.talent.setInterestShared("a", "i", true)],
      ["talent.setWorkPreferencesShared", () => repos.talent.setWorkPreferencesShared("a", true)],
      ["opportunities.list", () => repos.opportunities.list()], ["opportunities.get", () => repos.opportunities.get("o")],
      ["shortlists.get", () => repos.shortlists.get("u")], ["shortlists.toggle", () => repos.shortlists.toggle("u", "a")],
      ["directory.getCurrentUser", () => repos.directory.getCurrentUser()],
      ["proposals.list", () => repos.proposals.list(dummy)], ["proposals.get", () => repos.proposals.get(dummy, U(1))], ["proposals.submit", () => repos.proposals.submit("u", U(1))],
      ["proposals.withdraw", () => repos.proposals.withdraw("u", U(1))], ["proposals.review", () => repos.proposals.review("u", U(1), "approved")],
      ["proposals.confirmSeat", () => repos.proposals.confirmSeat("u", { seatId: U(1), startsOn: "2027-01-01", endsOn: null, availableFrom: null, allocation: null })],
      ["proposals.save", () => repos.proposals.save("u", { opportunityId: "o", title: "t", brief: "", noteForReviewer: "", seats: [{ roleRequirementId: null, title: "t", capabilities: [], seniority: null, allocation: 1, personId: null }] })],
      ["planning.listAssignments", () => repos.planning.listAssignments(dummy)],
      ["interests.listForPerson", () => repos.interests.listForPerson("a")], ["interests.listSharedFor", () => repos.interests.listSharedFor(dummy)],
      ["interests.express", () => repos.interests.express("a", "r", "n")], ["interests.withdraw", () => repos.interests.withdraw("a", "r")],
    ];
    for (const [name, run] of calls) {
      const before = getDb.mock.calls.length;
      await run().catch(() => undefined);
      expect(getDb.mock.calls.length, name).toBeGreaterThan(before);
    }
  });
});
