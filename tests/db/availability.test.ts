/**
 * Availability is derived from confirmed assignments (0007). The strongest test is parity: for the 12 fictional people the database must
 * compute exactly what the app's fixtures say (available from, status, current project, delivery lead, proposed-for). Then the rules
 * the fixtures do not exercise: part-time capacity, overlapping work, proposals as information only, and RLS on the result.
 */
import { describe, expect, it } from "vitest";
import { availability } from "@/data/fixtures/people";
import { DEMO_TODAY } from "@/data/fixtures/organization";
import { U, seedId } from "@/data/seed/ids";
import { seen, withDb } from "./setup";

const t = withDb();
const P = (slug: string) => seedId("person", slug);
const AVAIL = `select p.slug, a.available_from::text af, a.status::text st, a.free_capacity::float fc, a.current_project cp, a.current_project_ends::text cpe,
  u.display_name lead, o.slug prop, a.proposed_from::text pf
  from public.person_availability($1::date) a join people p on p.id = a.person_id left join app_users u on u.id = a.delivery_lead_id left join opportunities o on o.id = a.proposed_opportunity_id order by p.slug`;
const asStaff = () => seen(t.db, U.laura, AVAIL, [DEMO_TODAY]);
const give = (person: string, alloc: number, start: string, release: string | null) =>
  t.db.sql(`insert into assignments (person_id, project_name, starts_on, ends_on, available_from, allocation, delivery_lead_id, confirmed_by) values ($1, 'Work', $2, $3, $4, $5, $6, $6)`,
    [P(person), start, release ? new Date(new Date(release).getTime() - 86_400_000).toISOString().slice(0, 10) : null, release, alloc, U.rafael]);

describe("parity with the app's fixtures on the fictional demo day", () => {
  it("computes the same availability for all 12 people", async () => {
    const r = await asStaff();
    expect(r).toHaveLength(12);
    for (const a of availability) {
      const row = r.find((x) => x.slug === a.personId)!;
      expect(row, a.personId).toMatchObject({
        af: a.availableFrom, st: a.status, cp: a.currentProject, cpe: a.currentProjectEnds, lead: a.deliveryLead && a.currentProject ? a.deliveryLead : null,
        prop: a.proposedFor?.opportunityId ?? null, pf: a.proposedFor?.from ?? null,
      });
    }
  });
  it("the Home figure: 6 people are free within 60 days", async () => {
    const limit = new Date(new Date(DEMO_TODAY).getTime() + 60 * 86_400_000).toISOString().slice(0, 10);
    expect((await asStaff()).filter((x) => x.af <= limit).map((x) => x.slug).sort()).toEqual(["ana", "camila", "ethan", "javier", "lucia", "sofia"]);
  });
  it("people with nothing booked are free now with full capacity", async () => {
    expect((await asStaff()).find((x) => x.slug === "lucia")).toMatchObject({ af: DEMO_TODAY, fc: 1, cp: null });
  });
});

describe("part-time capacity and overlapping assignments", () => {
  it("someone half-booked is available now with half of their capacity free", async () => {
    await give("lucia", 0.5, "2026-11-01", "2027-03-01");
    expect((await asStaff()).find((x) => x.slug === "lucia")).toMatchObject({ af: DEMO_TODAY, fc: 0.5, cp: "Work" });
  });
  it("two overlapping halves fill the person: availability moves to the first release that frees capacity", async () => {
    await give("lucia", 0.5, "2026-11-01", "2027-03-01");
    await give("lucia", 0.5, "2026-11-10", "2027-02-01");
    expect((await asStaff()).find((x) => x.slug === "lucia")).toMatchObject({ af: "2027-02-01", fc: 0.5 });
  });
  it("a single full-time assignment hands over its release date, with all capacity free afterwards", async () => {
    await give("lucia", 1, "2026-11-01", "2027-02-10");
    expect((await asStaff()).find((x) => x.slug === "lucia")).toMatchObject({ af: "2027-02-10", fc: 1 });
  });
  it("open-ended full-time work means there is no availability date", async () => {
    await give("lucia", 1, "2026-11-01", null);
    expect((await asStaff()).find((x) => x.slug === "lucia")).toMatchObject({ af: null, fc: null });
  });
  it("future work does not make someone busy today: they are available now, with the later commitment ahead", async () => {
    await give("lucia", 1, "2027-03-01", "2027-06-01");
    expect((await asStaff()).find((x) => x.slug === "lucia")).toMatchObject({ af: DEMO_TODAY, fc: 1 });
  });
  it("'pending' while the end date that releases the person is still unconfirmed, 'confirmed' once it is", async () => {
    const before = (await asStaff()).find((x) => x.slug === "daniel")!;
    expect(before).toMatchObject({ st: "pending", af: "2027-02-02" });
    await t.db.sql("update assignments set end_confirmed = true where person_id = $1", [P("daniel")]);
    expect((await asStaff()).find((x) => x.slug === "daniel")).toMatchObject({ st: "confirmed", af: "2027-02-02" });
  });
});

describe("proposals are information, never an occupation", () => {
  it("being proposed overlays the opportunity but does not change when someone is available", async () => {
    const r = (await asStaff()).find((x) => x.slug === "lucia")!;
    expect(r).toMatchObject({ prop: "vela", pf: "2027-01-12", af: DEMO_TODAY, fc: 1 });
  });
  it("the overlay disappears once the seat is confirmed as an assignment (and the assignment takes over)", async () => {
    await t.db.sql("update team_proposals set state = 'approved'");
    await seen(t.db, U.rafael, "select public.confirm_assignment($1, '2027-01-12', '2027-06-30', '2027-07-01', 1)", [seedId("seat", "vela-ai")]);
    const r = (await asStaff()).find((x) => x.slug === "lucia")!;
    expect(r).toMatchObject({ prop: null, af: DEMO_TODAY, cp: null }); // free until Jan 12; the work has not started yet
    await t.db.sql("update assignments set starts_on = '2026-11-01' where person_id = $1", [P("lucia")]);
    expect((await asStaff()).find((x) => x.slug === "lucia")).toMatchObject({ af: "2027-07-01", cp: "Vela Bank" });
  });
  it("a withdrawn or declined proposal no longer overlays anything", async () => {
    await t.db.sql("update team_proposals set state = 'withdrawn'");
    expect((await asStaff()).find((x) => x.slug === "lucia")).toMatchObject({ prop: null });
  });
});

describe("availability respects row-level security (it runs as the caller)", () => {
  it("an engineer sees only themselves", async () => {
    expect((await seen(t.db, U.ana, AVAIL, [DEMO_TODAY])).map((x) => x.slug)).toEqual(["ana"]);
  });
  it("a staffing lead sees everyone", async () => {
    expect(await asStaff()).toHaveLength(12);
  });
  it("a delivery lead sees only the people they work with", async () => {
    expect((await seen(t.db, U.rafael, AVAIL, [DEMO_TODAY])).map((x) => x.slug)).toEqual(["ana", "camila", "javier", "lucia", "sofia"]);
    expect((await seen(t.db, U.ines, AVAIL, [DEMO_TODAY])).map((x) => x.slug)).toEqual(["daniel", "ethan", "marcus", "mateo", "priya", "tomas", "valentina"]);
  });
  it("anonymous callers cannot call it at all", async () => {
    const r = await t.db.attempt(() => seen(t.db, "anon", "select * from public.person_availability()"));
    expect(r.ok).toBe(false);
  });
});
