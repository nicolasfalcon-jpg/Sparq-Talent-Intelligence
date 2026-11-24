/**
 * Integrity rules, tested as the database OWNER so that access rules (RLS, grants) cannot mask them: check constraints, uniqueness,
 * foreign keys, state transitions and allocation arithmetic. Anything an API role may or may not do is in the rls-* files.
 */
import { describe, expect, it } from "vitest";
import { U, seedId } from "@/data/seed/ids";
import { denied, withDb } from "./setup";

const t = withDb();
const P = (slug: string) => seedId("person", slug);
const OPP = seedId("opportunity", "vela");
const run = (sql: string, params?: unknown[]) => t.db.attempt(() => t.db.sql(sql, params));
const one = async (sql: string, params?: unknown[]) => (await t.db.sql(sql, params))[0]!;

describe("verification metadata (skills and experience)", () => {
  const base = `insert into skill_evidence (person_id, label, source, detail`;
  it("a verified row needs a reviewer AND a time; neither alone is enough", async () => {
    expect(denied(await run(`${base}, verification) values ($1, 'Rust', 'professional', '', 'verified')`, [P("ana")]))).toMatch(/skill_evidence_verified_stamp/);
    expect(denied(await run(`${base}, verification, verified_by) values ($1, 'Rust', 'professional', '', 'verified', $2)`, [P("ana"), U.rafael]))).toMatch(/skill_evidence_verified_stamp/);
    expect((await run(`${base}, verification, verified_by, verified_at) values ($1, 'Rust', 'professional', '', 'verified', $2, now())`, [P("ana"), U.rafael])).ok).toBe(true);
  });
  it("an unverified row cannot carry reviewer, time or note", async () => {
    for (const col of ["verified_by, verified_at", "verification_note"]) {
      const vals = col === "verification_note" ? "'a note'" : `'${U.rafael}', now()`;
      expect(denied(await run(`${base}, verification, ${col}) values ($1, 'Rust', 'professional', '', 'self_reported', ${vals})`, [P("ana")])), col).toMatch(/skill_evidence_(verified_stamp|unverified_clean)/);
    }
    expect(denied(await run(`${base}, verification, verification_note) values ($1, 'Rust', 'professional', '', 'pending', 'a note')`, [P("ana")]))).toMatch(/unverified_clean/);
  });
  it("the same holds for professional experience", async () => {
    const ins = (v: string) => run(`insert into project_experience (person_id, client, role, title, verification${v ? ", verified_by, verified_at" : ""}) values ($1, 'C', 'R', 'T', '${v || "self_reported"}'${v ? `, '${U.rafael}', null` : ""})`, [P("ana")]);
    expect(denied(await ins("verified"))).toMatch(/project_experience_verified_stamp/);
  });
  it("a reviewer who has verified something cannot be deleted (their history must stay attributable)", async () => {
    await run("delete from public.app_users where id = $1", [U.rafael]).then((r) => expect(denied(r)).toMatch(/foreign key|violates/));
  });
  it("evidence needs a person that exists, and a label of 2–60 characters", async () => {
    expect(denied(await run(`${base}) values ('00000000-0000-0000-0000-000000000000', 'Rust', 'professional', '')`))).toMatch(/foreign key/);
    expect(denied(await run(`${base}) values ($1, 'x', 'professional', '')`, [P("ana")]))).toMatch(/check/);
  });
  it("no exact duplicate claim (same person, capability, source and label, case-insensitive)", async () => {
    const cap = seedId("capability", "aws");
    expect((await run(`${base}, capability_id) values ($1, 'Terraform', 'independent', '', $2)`, [P("ana"), cap])).ok).toBe(true);
    expect(denied(await run(`${base}, capability_id) values ($1, 'TERRAFORM', 'independent', '', $2)`, [P("ana"), cap]))).toMatch(/skill_evidence_unique_claim/);
    expect((await run(`${base}, capability_id) values ($1, 'Terraform', 'professional', '', $2)`, [P("ana"), cap])).ok).toBe(true); // other source
    expect((await run(`${base}, capability_id) values ($1, 'Terraform pro', 'independent', '', $2)`, [P("ana"), cap])).ok).toBe(true); // other label
  });
  it("deleting a profile removes its evidence (cascade), but never its assignments (restrict)", async () => {
    expect(denied(await run("delete from public.people where id = $1", [P("ana")]))).toMatch(/foreign key|violates/); // Ana has an assignment
    await t.db.sql("delete from public.assignments where person_id = $1", [P("lucia")]);
    await t.db.sql("update public.proposal_seats set person_id = null, seat_state = 'open' where person_id = $1", [P("lucia")]);
    expect((await run("delete from public.people where id = $1", [P("lucia")])).ok).toBe(true);
    expect((await one("select count(*)::int n from skill_evidence where person_id = $1", [P("lucia")])).n).toBe(0);
  });
});

describe("private interests and shared preferences", () => {
  it("a deselected interest can never be shared, and selecting it again does not re-share it", async () => {
    await t.db.sql("insert into career_interests (person_id, interest, selected, shared_with_staffing) values ($1, 'Robotics', false, true)", [P("lucia")]);
    expect((await one("select shared_with_staffing s from career_interests where person_id = $1 and interest = 'Robotics'", [P("lucia")])).s).toBe(false); // normalized, not rejected
    await t.db.sql("update career_interests set selected = true, shared_with_staffing = true where person_id = $1 and interest = 'Robotics'", [P("lucia")]);
    expect((await one("select shared_with_staffing s from career_interests where person_id = $1 and interest = 'Robotics'", [P("lucia")])).s).toBe(true);
    await t.db.sql("update career_interests set selected = false where person_id = $1 and interest = 'Robotics'", [P("lucia")]);
    expect((await one("select shared_with_staffing s from career_interests where person_id = $1 and interest = 'Robotics'", [P("lucia")])).s).toBe(false); // deselect withdraws
    await t.db.sql("update career_interests set selected = true where person_id = $1 and interest = 'Robotics'", [P("lucia")]);
    expect((await one("select shared_with_staffing s from career_interests where person_id = $1 and interest = 'Robotics'", [P("lucia")])).s).toBe(false); // back to private
  });
  it("new interests and preferences are private by default", async () => {
    await t.db.sql("insert into career_interests (person_id, interest) values ($1, 'Rust')", [P("lucia")]);
    await t.db.sql("insert into person_preferences (person_id, work_preferences) values ($1, 'Remote only')", [P("lucia")]);
    expect((await one("select shared_with_staffing s from career_interests where person_id = $1 and interest = 'Rust'", [P("lucia")])).s).toBe(false);
    expect((await one("select shared_with_staffing s from person_preferences where person_id = $1", [P("lucia")])).s).toBe(false);
  });
});

describe("proposal lifecycle (valid and invalid transitions, for every role)", () => {
  async function draft(opp: string | null = OPP): Promise<string> {
    return (await one("insert into team_proposals (opportunity_id, title, created_by) values ($1, 'Team', $2) returning id", [opp, U.laura])).id;
  }
  const move = (id: string, to: string, extra = "") => run(`update team_proposals set state = '${to}'${extra} where id = $1`, [id]);
  const stamps = `, submitted_by = '${U.laura}', submitted_at = now()`;

  it("allows exactly the documented transitions", async () => {
    const ok = [["draft", "submitted"], ["draft", "withdrawn"], ["submitted", "approved"], ["submitted", "declined"], ["submitted", "changes_requested"], ["submitted", "withdrawn"], ["changes_requested", "submitted"], ["changes_requested", "withdrawn"]] as const;
    const all = ["draft", "submitted", "changes_requested", "approved", "declined", "withdrawn"] as const;
    for (const from of all) for (const to of all) {
      if (from === to) continue;
      const id = await draft();
      await t.db.sql("alter table team_proposals disable trigger team_proposals_guard"); // reach every starting state without walking the graph
      await t.db.sql(`update team_proposals set state = '${from}', submitted_by = '${U.laura}', submitted_at = now() where id = $1`, [id]);
      await t.db.sql("alter table team_proposals enable trigger team_proposals_guard");
      const version = from === "changes_requested" && to === "submitted" ? ", version = version + 1" : "";
      const r = await move(id, to, version);
      const expected = ok.some(([a, b]) => a === from && b === to);
      expect(r.ok, `${from} -> ${to}`).toBe(expected);
      if (!expected) expect(denied(r), `${from} -> ${to}`).toMatch(/invalid proposal transition/);
    }
  });
  it("a resubmission must raise the version, and a first submission must not", async () => {
    const id = await draft();
    await move(id, "submitted", stamps);
    await move(id, "changes_requested");
    expect(denied(await move(id, "submitted"))).toMatch(/must increase the proposal version/);
    expect((await move(id, "submitted", ", version = version + 1")).ok).toBe(true);
  });
  it("it needs an opportunity and a submission stamp from the moment it leaves draft", async () => {
    const noOpp = await draft(null);
    expect(denied(await move(noOpp, "submitted", stamps))).toMatch(/proposal_has_opportunity_once_submitted/);
    const noStamp = await draft();
    expect(denied(await move(noStamp, "submitted"))).toMatch(/proposal_submission_stamp/);
    expect((await move(await draft(null), "withdrawn")).ok).toBe(true); // a draft with no opportunity can still be withdrawn
  });
  it("one review per proposal version; a return or decline must be explained", async () => {
    const id = await draft();
    await move(id, "submitted", stamps);
    const review = (decision: string, note: string | null, version = 1) =>
      run("insert into proposal_reviews (proposal_id, proposal_version, reviewer_id, decision, note) values ($1, $2, $3, $4, $5)", [id, version, U.rafael, decision, note]);
    expect(denied(await review("changes_requested", null))).toMatch(/review_explains_a_return/);
    expect(denied(await review("declined", "   "))).toMatch(/review_explains_a_return/);
    expect((await review("approved", null)).ok).toBe(true);
    expect(denied(await review("approved", null))).toMatch(/duplicate key|unique/);
    expect((await review("changes_requested", "Needs a QA seat", 2)).ok).toBe(true);
  });
  it("moving a proposal to another opportunity is refused while seats still link to the old opportunity's roles", async () => {
    const id = await draft();
    await t.db.sql("insert into proposal_seats (proposal_id, role_requirement_id, title) values ($1, $2, 'AI')", [id, seedId("role", "vela-ai")]);
    expect(denied(await run("update team_proposals set opportunity_id = $2 where id = $1", [id, seedId("opportunity", "cobalt")]))).toMatch(/role links/);
  });
});

describe("proposal seats: proposed is not assigned", () => {
  async function proposal() { return (await one("insert into team_proposals (opportunity_id, title, created_by) values ($1, 'Team', $2) returning id", [OPP, U.laura])).id as string; }
  it("a seat is 'proposed' exactly when it names a person", async () => {
    const id = await proposal();
    expect(denied(await run("insert into proposal_seats (proposal_id, title, seat_state) values ($1, 'AI', 'proposed')", [id]))).toMatch(/proposal_seat_state_matches_person/);
    expect(denied(await run("insert into proposal_seats (proposal_id, title, person_id, seat_state) values ($1, 'AI', $2, 'open')", [id, P("ana")]))).toMatch(/proposal_seat_state_matches_person/);
    expect((await run("insert into proposal_seats (proposal_id, title, person_id, seat_state) values ($1, 'AI', $2, 'proposed')", [id, P("ana")])).ok).toBe(true);
  });
  it("there is no 'confirmed' seat state: confirmation is an assignment", async () => {
    const id = await proposal();
    expect(denied(await run("insert into proposal_seats (proposal_id, title, seat_state) values ($1, 'AI', 'confirmed')", [id]))).toMatch(/invalid input value for enum/);
  });
  it("a person fills at most one seat per proposal, but may be proposed in several proposals", async () => {
    const a = await proposal(), b = await proposal();
    await t.db.sql("insert into proposal_seats (proposal_id, title, person_id, seat_state) values ($1, 'A', $2, 'proposed')", [a, P("ana")]);
    expect(denied(await run("insert into proposal_seats (proposal_id, title, person_id, seat_state) values ($1, 'B', $2, 'proposed')", [a, P("ana")]))).toMatch(/proposal_seats_one_per_person/);
    expect((await run("insert into proposal_seats (proposal_id, title, person_id, seat_state) values ($1, 'B', $2, 'proposed')", [b, P("ana")])).ok).toBe(true);
  });
  it("a seat's role requirement must belong to the proposal's opportunity", async () => {
    const id = await proposal();
    expect(denied(await run("insert into proposal_seats (proposal_id, role_requirement_id, title) values ($1, $2, 'x')", [id, seedId("role", "cobalt-ios")]))).toMatch(/does not belong/);
    expect((await run("insert into proposal_seats (proposal_id, role_requirement_id, title) values ($1, $2, 'x')", [id, seedId("role", "vela-ai")])).ok).toBe(true);
  });
  it("a proposal never creates an assignment by itself: inserting seats and moving states leaves assignments untouched", async () => {
    const before = (await one("select count(*)::int n from assignments")).n;
    const id = await proposal();
    await t.db.sql("insert into proposal_seats (proposal_id, title, person_id, seat_state) values ($1, 'A', $2, 'proposed')", [id, P("sofia")]);
    await t.db.sql(`update team_proposals set state = 'submitted', submitted_by = '${U.laura}', submitted_at = now() where id = $1`, [id]);
    await t.db.sql("update team_proposals set state = 'approved' where id = $1", [id]);
    expect((await one("select count(*)::int n from assignments")).n).toBe(before);
  });
});

describe("assignments and allocation: part-time and overlapping work is legitimate, over-allocation is not", () => {
  // Lucía has no assignment in the seed, so every arithmetic case starts from an empty calendar.
  const give = (alloc: number, start: string, release: string | null, person = "lucia") =>
    run(`insert into assignments (person_id, project_name, starts_on, ends_on, available_from, allocation, delivery_lead_id, confirmed_by) values ($1, 'Work', $2, $3, $4, $5, $6, $6)`,
      [P(person), start, release ? new Date(new Date(release).getTime() - 86_400_000).toISOString().slice(0, 10) : null, release, alloc, U.rafael]);

  it("two half-time assignments at the same time fit exactly", async () => {
    expect((await give(0.5, "2027-01-04", "2027-06-01")).ok).toBe(true);
    expect((await give(0.5, "2027-02-01", "2027-05-01")).ok).toBe(true);
  });
  it("60% + 60% is refused, with the peak reported", async () => {
    await give(0.6, "2027-01-04", "2027-06-01");
    expect(denied(await give(0.6, "2027-03-01", "2027-04-01"))).toMatch(/exceeds the person's capacity \(peak allocation 1\.2\d*\)/);
  });
  it("back-to-back work does not overlap: a person released on a date can start elsewhere that same day", async () => {
    expect((await give(1, "2027-01-04", "2027-02-01")).ok).toBe(true);
    expect((await give(1, "2027-02-01", "2027-03-01")).ok).toBe(true);
    expect(denied(await give(1, "2027-01-31", "2027-02-15"))).toMatch(/capacity/); // one day early is a real overlap
  });
  it("overlap is judged over the whole window, not just where the new assignment starts", async () => {
    await give(0.7, "2027-03-01", "2027-04-01"); // starts later than the new one begins
    expect(denied(await give(0.5, "2027-01-04", "2027-06-01"))).toMatch(/capacity/); // 0.5 + 0.7 during March
    expect((await give(0.3, "2027-01-04", "2027-06-01")).ok).toBe(true); // 0.3 + 0.7 = 1.0 exactly
  });
  it("several small commitments add up: three of 0.3 fit, a fourth does not", async () => {
    for (const start of ["2027-01-04", "2027-01-11", "2027-01-18"]) expect((await give(0.3, start, null)).ok, start).toBe(true);
    expect(denied(await give(0.3, "2027-02-01", "2027-03-01"))).toMatch(/capacity/);
    expect((await give(0.1, "2027-02-01", "2027-03-01")).ok).toBe(true);
  });
  it("open-ended work occupies the person indefinitely", async () => {
    await give(1, "2027-01-04", null);
    expect(denied(await give(0.2, "2030-01-01", "2030-02-01"))).toMatch(/capacity/);
  });
  it("editing an assignment re-checks capacity (extending it into someone else's window is refused)", async () => {
    await give(1, "2027-01-04", "2027-02-01");
    await give(1, "2027-03-01", "2027-04-01");
    const id = (await one("select id from assignments where person_id = $1 and starts_on = '2027-01-04'", [P("lucia")])).id;
    expect(denied(await run("update assignments set ends_on = '2027-03-10', available_from = '2027-03-11' where id = $1", [id]))).toMatch(/capacity/);
  });
  it("other people's assignments never count against someone's capacity", async () => {
    await give(1, "2027-01-04", "2027-06-01", "lucia");
    expect((await give(1, "2027-01-04", "2027-06-01", "sofia")).ok).toBe(true);
  });
  it("allocations are fractions in (0, 1], dates are ordered, and a release date follows the last day", async () => {
    expect(denied(await give(0, "2027-01-04", "2027-02-01"))).toMatch(/check/);
    expect(denied(await give(1.5, "2027-01-04", "2027-02-01"))).toMatch(/check/);
    expect(denied(await run("insert into assignments (person_id, project_name, starts_on, ends_on, available_from, delivery_lead_id, confirmed_by) values ($1, 'x', '2027-02-01', '2027-01-01', '2027-01-02', $2, $2)", [P("lucia"), U.rafael]))).toMatch(/assignment_dates/);
    expect(denied(await run("insert into assignments (person_id, project_name, starts_on, ends_on, available_from, delivery_lead_id, confirmed_by) values ($1, 'x', '2027-01-01', '2027-02-01', '2027-02-01', $2, $2)", [P("lucia"), U.rafael]))).toMatch(/assignment_release/);
    expect(denied(await run("insert into assignments (person_id, project_name, starts_on, ends_on, delivery_lead_id, confirmed_by) values ($1, 'x', '2027-01-01', '2027-02-01', $2, $2)", [P("lucia"), U.rafael]))).toMatch(/assignment_release/); // both end columns or neither
    expect((await give(0.333, "2027-01-04", "2027-02-01")).ok).toBe(true);
  });
  it("every assignment records the human who confirmed it", async () => {
    expect(denied(await run("insert into assignments (person_id, project_name, starts_on, delivery_lead_id) values ($1, 'x', '2027-01-01', $2)", [P("lucia"), U.rafael]))).toMatch(/confirmed_by/);
  });
});

describe("expressions of interest", () => {
  it("withdrawal is stamped automatically and re-sharing clears it; one expression per person and role", async () => {
    const role = seedId("role", "cobalt-ios");
    await t.db.sql("insert into expressions_of_interest (person_id, role_requirement_id) values ($1, $2)", [P("lucia"), role]);
    expect(denied(await run("insert into expressions_of_interest (person_id, role_requirement_id) values ($1, $2)", [P("lucia"), role]))).toMatch(/duplicate key|unique/);
    await t.db.sql("update expressions_of_interest set status = 'withdrawn' where person_id = $1 and role_requirement_id = $2", [P("lucia"), role]);
    expect((await one("select withdrawn_at is not null w from expressions_of_interest where person_id = $1 and role_requirement_id = $2", [P("lucia"), role])).w).toBe(true);
    await t.db.sql("update expressions_of_interest set status = 'shared' where person_id = $1 and role_requirement_id = $2", [P("lucia"), role]);
    expect((await one("select withdrawn_at is null w from expressions_of_interest where person_id = $1 and role_requirement_id = $2", [P("lucia"), role])).w).toBe(true);
  });
});
