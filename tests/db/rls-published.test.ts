/**
 * Migration 0010: engineers read PUBLISHED opportunities (status 'Open') and the opportunities they shared interest in, with their role
 * requirements, and nothing else. Seed: Cobalt and Terra are Open, Vela is Staffing (Ana has a shared expression of interest in its
 * mobile role), Nimbus is Upcoming.
 */
import { describe, expect, it } from "vitest";
import { U, seedId } from "@/data/seed/ids";
import { denied, grantRole, seen, tryAs, withDb } from "./setup";

const t = withDb();
const slugs = async (who: string, table = "opportunities") => (await seen(t.db, who, `select slug from ${table} order by slug`)).map((r) => r.slug);
const n = async (who: string, table: string) => Number((await seen(t.db, who, `select count(*)::int n from ${table}`))[0]!.n);

describe("an engineer reads published opportunities, and only what a published opportunity is", () => {
  it("sees the Open opportunities and the one she shared interest in; not Upcoming ones", async () => {
    expect(await slugs(U.ana)).toEqual(["cobalt", "terra", "vela"]); // vela: her own shared expression of interest
    expect(await slugs(U.lucia)).toEqual(["cobalt", "terra"]);
  });
  it("sees the role requirements of exactly those opportunities", async () => {
    expect(await slugs(U.lucia, "role_requirements")).toEqual(["cobalt-android", "cobalt-ios", "cobalt-lead", "terra-cloud", "terra-de1", "terra-de2"]);
    expect((await slugs(U.ana, "role_requirements")).filter((s) => s.startsWith("vela-")).length).toBe(4);
    expect((await slugs(U.ana, "role_requirements")).filter((s) => s.startsWith("nimbus-"))).toEqual([]);
  });
  it("nothing about people leaks through them: proposals, seats, reviews, reviewers and assignments of others stay invisible", async () => {
    for (const table of ["team_proposals", "proposal_seats", "proposal_reviews", "opportunity_delivery_leads", "shortlists"]) expect(await n(U.lucia, table), table).toBe(0);
    expect((await seen(t.db, U.ana, "select distinct person_id from assignments")).length).toBe(1); // only her own
    const cols = await seen(t.db, U.lucia, "select * from role_requirements limit 1");
    expect(Object.keys(cols[0]!).filter((c) => /person|proposed/.test(c))).toEqual([]);
  });
  it("publication follows the status: opening an opportunity shows it, taking it out of Open hides it again", async () => {
    await t.db.sql("update opportunities set status = 'Open' where slug = 'nimbus'");
    expect(await slugs(U.lucia)).toEqual(["cobalt", "nimbus", "terra"]);
    await t.db.sql("update opportunities set status = 'Staffing' where slug = 'cobalt'");
    expect(await slugs(U.lucia)).toEqual(["nimbus", "terra"]);
    expect(await slugs(U.lucia, "role_requirements")).not.toContain("cobalt-ios");
  });
  it("withdrawing her expression of interest takes the (non-published) opportunity away from her again", async () => {
    expect((await tryAs(t.db, U.ana, "update expressions_of_interest set status = 'withdrawn' where status = 'shared'")).ok).toBe(true);
    expect(await slugs(U.ana)).toEqual(["cobalt", "terra"]);
  });
  it("only the owner's own SHARED interest opens a non-published opportunity to her; Ana's interest gives Lucía nothing", async () => {
    expect(await slugs(U.lucia)).toEqual(["cobalt", "terra"]); // Ana has a shared interest in Vela; that is Ana's, not Lucía's
    const nimbus = seedId("role", "nimbus-arch");
    const eoi = (role: string) => tryAs(t.db, U.lucia, "insert into expressions_of_interest (person_id, role_requirement_id, note) values ($1, $2, 'x')", [seedId("person", "lucia"), role]);
    expect((await eoi(nimbus)).ok).toBe(false); // Upcoming opportunities are not open for interest (role_open_for_interest, 0006)
    expect(await slugs(U.lucia)).toEqual(["cobalt", "terra"]);
    expect((await eoi(seedId("role", "vela-mobile"))).ok).toBe(true); // a Staffing role IS open for interest: her own shared interest then explains why she can see Vela
    expect(await slugs(U.lucia)).toEqual(["cobalt", "terra", "vela"]);
    expect(await slugs(U.ana)).toEqual(["cobalt", "terra", "vela"]);
  });
  it("is read-only: an engineer cannot create or change opportunities or roles", async () => {
    expect(denied(await tryAs(t.db, U.lucia, "insert into opportunities (slug, client, client_initials, name, kickoff, duration_months, status) values ('x', 'X', 'X', 'X', '2027-05-01', 1, 'Open')"))).toMatch(/row-level security|permission denied/);
    expect((await seen(t.db, U.lucia, "update opportunities set name = 'x' returning id")).length).toBe(0);
    expect((await seen(t.db, U.lucia, "delete from role_requirements returning id")).length).toBe(0);
  });
  it("anonymous callers still get nothing, and the helper is not callable by them", async () => {
    expect(denied(await tryAs(t.db, "anon", "select * from opportunities limit 1"))).toMatch(/permission denied/);
    expect(denied(await tryAs(t.db, "anon", "select private.can_see_published_opportunity(gen_random_uuid())"))).toMatch(/permission denied/);
  });
  it("the helper never returns NULL, for any caller and any argument", async () => {
    for (const who of [U.ana, U.lucia, U.laura, U.rafael, U.admin, "00000000-0000-4000-8000-00000000dead"]) {
      for (const arg of [null, "00000000-0000-4000-8000-000000000001", seedId("opportunity", "vela"), seedId("opportunity", "cobalt")]) {
        const r = await seen(t.db, who, "select private.can_see_published_opportunity($1::uuid) v", [arg]);
        expect(typeof r[0]!.v, `${who} ${arg}`).toBe("boolean");
      }
    }
  });
});

describe("the other roles are unchanged", () => {
  it("staffing leads and admins read all four opportunities; delivery leads only the ones they lead", async () => {
    expect(await slugs(U.laura)).toEqual(["cobalt", "nimbus", "terra", "vela"]);
    expect(await slugs(U.admin)).toEqual(["cobalt", "nimbus", "terra", "vela"]);
    expect(await slugs(U.rafael)).toEqual(["terra", "vela"]);
    expect(await slugs(U.ines)).toEqual(["cobalt", "nimbus"]);
  });
  it("a delivery lead is not an engineer: published status adds nothing for her", async () => {
    await t.db.sql("update opportunities set status = 'Open' where slug = 'nimbus'"); // Ines already leads it; Rafael does not
    expect(await slugs(U.rafael)).toEqual(["terra", "vela"]);
  });
  it("a person who is both engineer and delivery lead gets the union, not more", async () => {
    await grantRole(t.db, U.camila, "delivery_lead");
    await tryAs(t.db, U.admin, "select public.assign_delivery_lead($1, $2, true)", [seedId("opportunity", "nimbus"), U.camila]);
    expect(await slugs(U.camila)).toEqual(["cobalt", "nimbus", "terra"]); // published (cobalt, terra) + the one she leads
    expect(await n(U.camila, "team_proposals")).toBe(0);
  });
});
