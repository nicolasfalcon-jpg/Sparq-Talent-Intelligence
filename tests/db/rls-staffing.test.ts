/**
 * The staffing workflow under real roles. A proposal never becomes an assignment by itself: draft -> submitted -> HUMAN REVIEW ->
 * approved -> an explicit, separate CONFIRMATION by the opportunity's delivery lead. Each step has one authorized actor.
 * Cobalt Mobility is led by Ines; Vela Bank and Terra Foods by Rafael; Laura is the only staffing lead (a second one is created where needed).
 */
import { describe, expect, it } from "vitest";
import { U, seedId } from "@/data/seed/ids";
import { denied, grantRole, seen, tryAs, withDb } from "./setup";

const t = withDb();
const P = (slug: string) => seedId("person", slug);
const COBALT = seedId("opportunity", "cobalt");
const SECOND_LEAD = "00000000-0000-4000-8000-0000000000b2";
const q = (who: string, sql: string, params?: unknown[]) => seen(t.db, who, sql, params);
const stateOf = async (id: string) => (await t.db.sql("select state::text s, version v from team_proposals where id = $1", [id]))[0]!;
const assignmentsOf = async (person: string) => Number((await t.db.sql("select count(*)::int n from assignments where person_id = $1", [P(person)]))[0]!.n);

/** Laura writes a draft for Cobalt with an iOS seat (Javier proposed) and an Android seat (open). */
async function draft(who: string = U.laura): Promise<{ id: string; ios: string; android: string }> {
  const [d] = await q(who, "insert into team_proposals (opportunity_id, title, brief) values ($1, 'Cobalt Mobility team', 'Native rebuild') returning id::text id", [COBALT]);
  const [ios] = await q(who, "insert into proposal_seats (proposal_id, role_requirement_id, position, title, person_id, seat_state) values ($1, $2, 0, 'iOS Engineer', $3, 'proposed') returning id::text id", [d!.id, seedId("role", "cobalt-ios"), P("javier")]);
  const [android] = await q(who, "insert into proposal_seats (proposal_id, role_requirement_id, position, title) values ($1, $2, 1, 'Android Engineer') returning id::text id", [d!.id, seedId("role", "cobalt-android")]);
  return { id: d!.id, ios: ios!.id, android: android!.id };
}
const submit = (who: string, id: string, note: string | null = null) => tryAs(t.db, who, "select public.submit_proposal($1, $2)", [id, note]);
const review = (who: string, id: string, decision: string, note: string | null = null) => tryAs(t.db, who, "select public.review_proposal($1, $2, $3)", [id, decision, note]);
const confirm = (who: string, seat: string, start = "2027-01-19", ends: string | null = "2027-10-18", release: string | null = "2027-10-19", alloc: number | null = null) =>
  tryAs(t.db, who, "select public.confirm_assignment($1, $2, $3, $4, $5) id", [seat, start, ends, release, alloc]);
async function addSecondLead() {
  await t.db.sql("insert into auth.users (id) values ($1)", [SECOND_LEAD]);
  await t.db.sql("insert into app_users (id, display_name) values ($1, 'Second Lead')", [SECOND_LEAD]);
  await t.db.sql("insert into user_roles (user_id, role) values ($1, 'staffing_lead')", [SECOND_LEAD]);
}

describe("writing a proposal: only its author, only while it is a draft (or was returned)", () => {
  it("a staffing lead creates a draft; authorship cannot be forged and state cannot be set", async () => {
    const d = await draft();
    expect((await t.db.sql("select created_by::text c, state::text s from team_proposals where id = $1", [d.id]))[0]).toEqual({ c: U.laura, s: "draft" });
    expect(denied(await tryAs(t.db, U.laura, "insert into team_proposals (opportunity_id, title, created_by) values ($1, 'x', $2)", [COBALT, U.rafael]))).toMatch(/permission denied/);
    expect(denied(await tryAs(t.db, U.laura, "insert into team_proposals (opportunity_id, title, state) values ($1, 'x', 'approved')", [COBALT]))).toMatch(/permission denied/);
    for (const set of ["state = 'approved'", "version = 9", "submitted_by = created_by", "submitted_at = now()", `created_by = '${U.rafael}'`]) {
      expect(denied(await tryAs(t.db, U.laura, `update team_proposals set ${set} where id = $1`, [d.id])), set).toMatch(/permission denied/);
    }
  });
  it("engineers, delivery leads and administrators cannot create proposals", async () => {
    for (const who of [U.ana, U.rafael, U.admin]) expect(denied(await tryAs(t.db, who, "insert into team_proposals (opportunity_id, title) values ($1, 'x')", [COBALT])), who).toMatch(/row-level security/);
  });
  it("another staffing lead can neither see nor edit nor submit nor delete someone else's draft", async () => {
    await addSecondLead();
    const d = await draft();
    expect((await q(SECOND_LEAD, "select count(*)::int n from team_proposals where id = $1", [d.id]))[0]!.n).toBe(0);
    expect((await q(SECOND_LEAD, "update team_proposals set title = 'hijack' where id = $1 returning id", [d.id])).length).toBe(0);
    expect((await q(SECOND_LEAD, "delete from team_proposals where id = $1 returning id", [d.id])).length).toBe(0);
    expect(denied(await tryAs(t.db, SECOND_LEAD, "insert into proposal_seats (proposal_id, title) values ($1, 'planted')", [d.id]))).toMatch(/row-level security/);
    expect(denied(await submit(SECOND_LEAD, d.id))).toMatch(/proposal not found|only the staffing lead who wrote/);
  });
  it("delivery leads see no drafts, even for their own opportunity", async () => {
    const d = await draft();
    for (const who of [U.ines, U.rafael]) expect((await q(who, "select count(*)::int n from team_proposals where id = $1", [d.id]))[0]!.n, who).toBe(0);
  });
  it("the author can delete a draft but not a submitted proposal", async () => {
    const d = await draft();
    expect((await q(U.laura, "delete from team_proposals where id = $1 returning id", [d.id])).length).toBe(1);
    const e = await draft();
    await submit(U.laura, e.id);
    expect((await q(U.laura, "delete from team_proposals where id = $1 returning id", [e.id])).length).toBe(0);
  });
  it("seats keep the person/state invariants and their role must belong to the opportunity, even via the API", async () => {
    const d = await draft();
    expect(denied(await tryAs(t.db, U.laura, "insert into proposal_seats (proposal_id, title, person_id, seat_state) values ($1, 'x', $2, 'open')", [d.id, P("ana")]))).toMatch(/proposal_seat_state_matches_person/);
    expect(denied(await tryAs(t.db, U.laura, "insert into proposal_seats (proposal_id, role_requirement_id, title) values ($1, $2, 'x')", [d.id, seedId("role", "vela-ai")]))).toMatch(/does not belong/);
  });
});

describe("submitting", () => {
  it("only the author submits; the proposal needs an opportunity and a seat; it records who and when, and is audited", async () => {
    const d = await draft();
    for (const who of [U.ana, U.rafael, U.ines, U.admin, U.camila]) expect(denied(await submit(who, d.id)), who).toMatch(/only the staffing lead who wrote|proposal not found/);
    const empty = (await q(U.laura, "insert into team_proposals (opportunity_id, title) values ($1, 'Empty') returning id::text id", [COBALT]))[0]!.id;
    expect(denied(await submit(U.laura, empty))).toMatch(/at least one seat/);
    const noOpp = (await q(U.laura, "insert into team_proposals (title) values ('No opportunity') returning id::text id"))[0]!.id;
    await q(U.laura, "insert into proposal_seats (proposal_id, title) values ($1, 'x')", [noOpp]);
    expect(denied(await submit(U.laura, noOpp))).toMatch(/choose an opportunity/);
    expect((await submit(U.laura, d.id, "Please review soon")).ok).toBe(true);
    expect(await stateOf(d.id)).toEqual({ s: "submitted", v: 1 });
    expect((await t.db.sql("select submitted_by::text b, note_for_reviewer n, submitted_at is not null a from team_proposals where id = $1", [d.id]))[0]).toEqual({ b: U.laura, n: "Please review soon", a: true });
    expect((await t.db.sql("select actor_id::text a, action from audit_log where subject_id = $1", [d.id]))).toEqual([{ a: U.laura, action: "proposal.submit" }]);
  });
  it("it cannot be submitted twice, and a submitted proposal can no longer be edited by its author", async () => {
    const d = await draft();
    await submit(U.laura, d.id);
    expect(denied(await submit(U.laura, d.id))).toMatch(/cannot be submitted/);
    expect((await q(U.laura, "update team_proposals set title = 'changed' where id = $1 returning id", [d.id])).length).toBe(0);
    expect((await q(U.laura, "update proposal_seats set title = 'changed' where proposal_id = $1 returning id", [d.id])).length).toBe(0);
    // The BEFORE trigger answers first (RLS WITH CHECK would also refuse it): either way a submitted proposal takes no new seat.
    expect(denied(await tryAs(t.db, U.laura, "insert into proposal_seats (proposal_id, title) values ($1, 'late')", [d.id]))).toMatch(/can no longer be edited|row-level security/);
  });
  it("once submitted it is visible to staffing leads and to the opportunity's delivery lead only", async () => {
    const d = await draft();
    await submit(U.laura, d.id);
    const count = async (who: string) => Number((await q(who, "select count(*)::int n from team_proposals where id = $1", [d.id]))[0]!.n);
    expect(await count(U.laura)).toBe(1);
    expect(await count(U.ines)).toBe(1); // leads Cobalt
    for (const who of [U.rafael, U.ana, U.camila, U.admin]) expect(await count(who), who).toBe(0);
  });
});

describe("the human review", () => {
  it("only the delivery lead ASSIGNED to the opportunity can review: no other role, no other lead, not even the author", async () => {
    const d = await draft();
    await submit(U.laura, d.id);
    for (const who of [U.laura, U.ana, U.rafael, U.camila, U.admin]) expect(denied(await review(who, d.id, "approved")), who).toMatch(/only the delivery lead assigned to this opportunity/);
    expect(await stateOf(d.id)).toEqual({ s: "submitted", v: 1 });
    expect((await t.db.sql("select count(*)::int n from proposal_reviews where proposal_id = $1", [d.id]))[0]!.n).toBe(0);
  });
  it("separation of duties: a person who is both author and assigned delivery lead cannot review their own proposal", async () => {
    const d = await draft();
    await submit(U.laura, d.id);
    await tryAs(t.db, U.admin, "select public.grant_user_role($1, 'delivery_lead')", [U.laura]);
    await tryAs(t.db, U.admin, "select public.assign_delivery_lead($1, $2, true)", [COBALT, U.laura]);
    expect(denied(await review(U.laura, d.id, "approved"))).toMatch(/cannot review your own proposal/);
  });
  it("a draft cannot be reviewed; a return or decline needs a written reason", async () => {
    const d = await draft();
    expect(denied(await review(U.ines, d.id, "approved"))).toMatch(/only a submitted proposal can be reviewed \(it is draft\)/);
    await submit(U.laura, d.id);
    expect(denied(await review(U.ines, d.id, "changes_requested"))).toMatch(/review_explains_a_return/);
    expect(denied(await review(U.ines, d.id, "declined", "  "))).toMatch(/review_explains_a_return/);
    expect(await stateOf(d.id)).toEqual({ s: "submitted", v: 1 });
  });
  it("changes requested -> the author edits -> resubmits (version 2) -> approved: each review is a separate immutable record", async () => {
    const d = await draft();
    await submit(U.laura, d.id);
    expect((await review(U.ines, d.id, "changes_requested", "Add a QA seat")).ok).toBe(true);
    expect(await stateOf(d.id)).toEqual({ s: "changes_requested", v: 1 });
    expect((await q(U.laura, "update team_proposals set title = 'Cobalt Mobility team v2' where id = $1 returning id", [d.id])).length).toBe(1); // editable again
    expect((await tryAs(t.db, U.laura, "insert into proposal_seats (proposal_id, title) values ($1, 'QA') returning id", [d.id])).ok).toBe(true);
    expect((await submit(U.laura, d.id)).ok).toBe(true);
    expect(await stateOf(d.id)).toEqual({ s: "submitted", v: 2 });
    expect((await review(U.ines, d.id, "approved")).ok).toBe(true);
    expect(await stateOf(d.id)).toEqual({ s: "approved", v: 2 });
    expect(await t.db.sql("select proposal_version v, decision::text d, reviewer_id::text r from proposal_reviews where proposal_id = $1 order by proposal_version", [d.id])).toEqual([
      { v: 1, d: "changes_requested", r: U.ines }, { v: 2, d: "approved", r: U.ines },
    ]);
  });
  it("reviews are immutable for every role, the reviewer included", async () => {
    const d = await draft();
    await submit(U.laura, d.id);
    await review(U.ines, d.id, "approved");
    for (const who of [U.ines, U.laura, U.admin]) {
      expect(denied(await tryAs(t.db, who, "update proposal_reviews set decision = 'declined'")), who).toMatch(/permission denied/);
      expect(denied(await tryAs(t.db, who, "delete from proposal_reviews")), who).toMatch(/permission denied/);
      expect(denied(await tryAs(t.db, who, "insert into proposal_reviews (proposal_id, proposal_version, reviewer_id, decision) values (gen_random_uuid(), 1, gen_random_uuid(), 'approved')")), who).toMatch(/permission denied/);
    }
  });
  it("a declined or approved proposal is final: it cannot be edited, withdrawn, resubmitted or reviewed again", async () => {
    const d = await draft();
    await submit(U.laura, d.id);
    await review(U.ines, d.id, "approved");
    expect((await q(U.laura, "update team_proposals set title = 'x' where id = $1 returning id", [d.id])).length).toBe(0);
    expect(denied(await tryAs(t.db, U.laura, "select public.withdraw_proposal($1)", [d.id]))).toMatch(/cannot be withdrawn/);
    expect(denied(await submit(U.laura, d.id))).toMatch(/cannot be submitted/);
    expect(denied(await review(U.ines, d.id, "declined", "second thoughts"))).toMatch(/only a submitted proposal can be reviewed/);
    const e = await draft();
    await submit(U.laura, e.id);
    await review(U.ines, e.id, "declined", "Not the right shape");
    expect(denied(await submit(U.laura, e.id))).toMatch(/cannot be submitted/);
  });
  it("withdrawing: the author may withdraw until a final decision; nobody else may; a withdrawn proposal cannot be reviewed", async () => {
    const d = await draft();
    await submit(U.laura, d.id);
    for (const who of [U.ines, U.admin, U.ana]) expect(denied(await tryAs(t.db, who, "select public.withdraw_proposal($1)", [d.id])), who).toMatch(/only the author|proposal not found/);
    expect((await tryAs(t.db, U.laura, "select public.withdraw_proposal($1)", [d.id])).ok).toBe(true);
    expect(await stateOf(d.id)).toEqual({ s: "withdrawn", v: 1 });
    expect(denied(await review(U.ines, d.id, "approved"))).toMatch(/only a submitted proposal can be reviewed/);
  });
});

describe("approval is NOT assignment: confirming is a separate, explicit act", () => {
  async function approved() {
    const d = await draft();
    await submit(U.laura, d.id);
    await review(U.ines, d.id, "approved");
    return d;
  }
  it("approving a proposal creates no assignment, for anyone, and Javier's availability is unchanged", async () => {
    const before = await assignmentsOf("javier");
    const d = await approved();
    expect(await assignmentsOf("javier")).toBe(before);
    expect((await t.db.sql("select count(*)::int n from assignments where proposal_seat_id = $1", [d.ios]))[0]!.n).toBe(0);
    const [a] = await q(U.laura, "select available_from::text af, proposed_opportunity_id::text o from public.person_availability('2026-11-24') where person_id = $1", [P("javier")]);
    expect(a).toEqual({ af: "2027-01-05", o: COBALT }); // still free from his Meridian release date; Cobalt is only an overlay
  });
  it("only the delivery lead assigned to the opportunity can confirm: not the author, not another lead, not an engineer, not an administrator", async () => {
    const d = await approved();
    for (const who of [U.laura, U.rafael, U.camila, U.ana, U.admin]) expect(denied(await confirm(who, d.ios)), who).toMatch(/only the delivery lead assigned to this opportunity/);
    expect(await assignmentsOf("javier")).toBe(1); // only his existing Meridian Health assignment
  });
  it("the authorized delivery lead confirms a seat: the assignment records who confirmed it and where it came from; audited", async () => {
    const d = await approved();
    const r = await confirm(U.ines, d.ios);
    expect(r.ok).toBe(true);
    const [a] = await t.db.sql("select project_name p, allocation::float al, end_confirmed ec, confirmed_by::text cb, delivery_lead_id::text dl, proposal_seat_id::text s, opportunity_id::text o, starts_on::text st, available_from::text rel from assignments where proposal_seat_id = $1", [d.ios]);
    expect(a).toEqual({ p: "Cobalt Mobility", al: 1, ec: false, cb: U.ines, dl: U.ines, s: d.ios, o: COBALT, st: "2027-01-19", rel: "2027-10-19" });
    expect((await t.db.sql("select actor_id::text a, subject_person_id::text p, details ->> 'seat_id' s from audit_log where action = 'assignment.confirm' and subject_person_id = $1 and details ->> 'seeded' is null", [P("javier")]))).toEqual([{ a: U.ines, p: P("javier"), s: d.ios }]);
  });
  it("it is refused unless the proposal is approved, the seat names a person, and it is not already confirmed", async () => {
    const draftOnly = await draft();
    expect(denied(await confirm(U.ines, draftOnly.ios))).toMatch(/only seats of an approved proposal can be confirmed \(it is draft\)/);
    const d = await approved();
    expect(denied(await confirm(U.ines, d.android))).toMatch(/no proposed person/);
    expect((await confirm(U.ines, d.ios)).ok).toBe(true);
    expect(denied(await confirm(U.ines, d.ios))).toMatch(/already confirmed/);
    expect((await t.db.sql("select count(*)::int n from assignments where proposal_seat_id = $1", [d.ios]))[0]!.n).toBe(1);
  });
  it("it respects capacity: confirming over someone's existing full-time work is refused, a part-time overlap that fits is accepted", async () => {
    const d = await approved();
    expect(denied(await confirm(U.ines, d.ios, "2026-12-01", "2027-03-31", "2027-04-01"))).toMatch(/exceeds the person's capacity/); // Javier is on Meridian until Jan 5
    expect((await confirm(U.ines, d.ios, "2026-12-01", "2027-03-31", "2027-04-01", 0.0)).ok).toBe(false); // zero is not an allocation
    await t.db.sql("update assignments set allocation = 0.5 where person_id = $1", [P("javier")]); // Javier is now half-time on Meridian
    expect((await confirm(U.ines, d.ios, "2026-12-01", "2027-03-31", "2027-04-01", 0.5)).ok).toBe(true); // 0.5 + 0.5 fits
  });
  it("a delivery lead cannot confirm their own assignment (separation of duties)", async () => {
    await grantRole(t.db, U.camila, "delivery_lead"); // an engineer who is also a delivery lead: the database supports it, the seed does not create it
    await tryAs(t.db, U.admin, "select public.assign_delivery_lead($1, $2, true)", [COBALT, U.camila]);
    const d = (await q(U.laura, "insert into team_proposals (opportunity_id, title) values ($1, 'Camila on Cobalt') returning id::text id", [COBALT]))[0]!.id;
    const seat = (await q(U.laura, "insert into proposal_seats (proposal_id, title, person_id, seat_state) values ($1, 'QA', $2, 'proposed') returning id::text id", [d, P("camila")]))[0]!.id;
    await submit(U.laura, d);
    await review(U.ines, d, "approved");
    expect(denied(await confirm(U.camila, seat, "2027-02-01", null, null))).toMatch(/cannot confirm your own assignment/);
    expect((await confirm(U.ines, seat, "2027-02-01", null, null)).ok).toBe(true);
  });
  it("no role can create or edit assignments directly", async () => {
    for (const who of [U.ines, U.laura, U.admin, U.ana]) {
      expect(denied(await tryAs(t.db, who, `insert into assignments (person_id, project_name, starts_on, delivery_lead_id, confirmed_by) values ('${P("lucia")}', 'x', '2030-01-01', '${who}', '${who}')`)), who).toMatch(/permission denied/);
      expect(denied(await tryAs(t.db, who, "update assignments set allocation = 0.1")), who).toMatch(/permission denied/);
      expect(denied(await tryAs(t.db, who, "delete from assignments")), who).toMatch(/permission denied/);
    }
  });
  it("the seed's own Vela proposal is the same story: Lucía and Camila are proposed, neither has an assignment, and Rafael (not Ines) can review it", async () => {
    const vela = seedId("proposal", "vela");
    expect((await t.db.sql("select count(*)::int n from assignments where person_id in ($1, $2) and proposal_seat_id is not null", [P("lucia"), P("camila")]))[0]!.n).toBe(0);
    expect(denied(await review(U.ines, vela, "approved"))).toMatch(/only the delivery lead assigned/);
    expect((await review(U.rafael, vela, "approved")).ok).toBe(true);
    expect((await t.db.sql("select count(*)::int n from assignments where person_id in ($1, $2) and proposal_seat_id is not null", [P("lucia"), P("camila")]))[0]!.n).toBe(0); // approval alone assigns nobody
  });
});

describe("opportunities, roles and shortlists", () => {
  it("a staffing lead creates opportunities and roles for themselves; nobody else's opportunity is theirs to edit", async () => {
    await addSecondLead();
    const [o] = await q(U.laura, "insert into opportunities (slug, client, client_initials, name, kickoff, duration_months) values ('zeta', 'Zeta', 'ZZ', 'New work', '2027-05-03', 4) returning id::text id, created_by::text c, status::text s");
    expect(o).toMatchObject({ c: U.laura, s: "Upcoming" });
    expect((await tryAs(t.db, U.laura, "insert into role_requirements (slug, opportunity_id, title) values ('zeta-1', $1, 'Engineer') returning id", [o!.id])).ok).toBe(true);
    expect((await q(SECOND_LEAD, "update opportunities set name = 'hijack' where id = $1 returning id", [o!.id])).length).toBe(0);
    expect(denied(await tryAs(t.db, SECOND_LEAD, "insert into role_requirements (slug, opportunity_id, title) values ('zeta-2', $1, 'x')", [o!.id]))).toMatch(/row-level security/);
    expect(denied(await tryAs(t.db, U.laura, "update opportunities set slug = 'renamed' where id = $1", [o!.id]))).toMatch(/permission denied/);
    expect(denied(await tryAs(t.db, U.laura, "insert into opportunities (slug, client, client_initials, name, kickoff, duration_months, created_by) values ('y', 'Y', 'Y', 'Y', '2027-01-01', 1, $1)", [U.rafael]))).toMatch(/permission denied/);
  });
  it("delivery leads, engineers and administrators cannot create opportunities", async () => {
    for (const who of [U.rafael, U.ana, U.admin]) expect(denied(await tryAs(t.db, who, "insert into opportunities (slug, client, client_initials, name, kickoff, duration_months) values ('q', 'Q', 'Q', 'Q', '2027-01-01', 1)")), who).toMatch(/row-level security/);
  });
  it("shortlists are private to their owner and only for staffing leads", async () => {
    expect((await tryAs(t.db, U.laura, "insert into shortlists (owner_id, person_id) values ($1, $2) returning person_id", [U.laura, P("ana")])).ok).toBe(true);
    expect(denied(await tryAs(t.db, U.laura, "insert into shortlists (owner_id, person_id) values ($1, $2)", [U.rafael, P("ana")]))).toMatch(/row-level security/);
    expect(denied(await tryAs(t.db, U.ana, "insert into shortlists (owner_id, person_id) values ($1, $2)", [U.ana, P("lucia")]))).toMatch(/row-level security/);
    await addSecondLead();
    expect((await q(SECOND_LEAD, "select count(*)::int n from shortlists"))[0]!.n).toBe(0);
    expect((await q(SECOND_LEAD, "delete from shortlists returning person_id")).length).toBe(0);
  });
});
