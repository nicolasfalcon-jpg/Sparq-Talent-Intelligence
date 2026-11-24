/**
 * Who can SEE what, executed under real roles: the row-level half of the access matrix (docs/handoff/08-authorization-and-evidence.md §7).
 * Seed users: laura = staffing lead; ana, lucia = engineers; rafael leads Vela and Terra, ines leads Cobalt and Nimbus (both delivery
 * leads); camila = engineer AND delivery lead (no project assigned); admin = administrator.
 */
import { describe, expect, it } from "vitest";
import { U, seedId } from "@/data/seed/ids";
import { denied, seen, tryAs, withDb } from "./setup";

const t = withDb();
const P = (slug: string) => seedId("person", slug);
const slugs = async (who: string, table = "people", col = "slug") =>
  (await seen(t.db, who, table === "people" ? "select slug from people order by slug" : `select p.slug from ${table} x join people p on p.id = x.person_id group by p.slug order by p.slug`)).map((r) => r[col] as string);
const n = async (who: string, table: string, where = "true") => Number((await seen(t.db, who, `select count(*)::int n from ${table} where ${where}`))[0]!.n);

const ALL_TABLES = [
  "app_users", "user_roles", "capabilities", "people", "person_preferences", "career_journey_entries", "certifications", "skill_evidence", "project_experience", "career_interests",
  "opportunities", "role_requirements", "opportunity_delivery_leads", "shortlists", "team_proposals", "proposal_seats", "proposal_reviews", "assignments", "expressions_of_interest", "audit_log",
];

describe("anonymous callers get nothing", () => {
  it.each(ALL_TABLES)("anon cannot read %s", async (table) => {
    expect(denied(await tryAs(t.db, "anon", `select * from ${table} limit 1`))).toMatch(/permission denied/);
  });
  it("anon cannot write anything either", async () => {
    expect(denied(await tryAs(t.db, "anon", "insert into capabilities (slug, name, grp) values ('x', 'X', 'web')"))).toMatch(/permission denied/);
    expect(denied(await tryAs(t.db, "anon", "update people set summary = 'x'"))).toMatch(/permission denied/);
  });
  it("anon cannot call a single function in the API schema", async () => {
    for (const fn of ["my_identity()", "person_availability()", "grant_user_role(gen_random_uuid(), 'admin')", "review_proposal(gen_random_uuid(), 'approved', null)"]) {
      expect(denied(await tryAs(t.db, "anon", `select public.${fn}`)), fn).toMatch(/permission denied for function/);
    }
  });
  it("a signed-in identity that is not in app_users (no roles at all) sees no business data", async () => {
    const ghost = "00000000-0000-4000-8000-00000000dead";
    for (const table of ["people", "skill_evidence", "opportunities", "team_proposals", "assignments", "career_interests", "audit_log", "shortlists", "expressions_of_interest"]) {
      expect(await n(ghost, table), table).toBe(0);
    }
  });
});

describe("engineer (Ana): her own profile and nothing about anyone else", () => {
  it("sees one profile, her own", async () => expect(await slugs(U.ana)).toEqual(["ana"]));
  it("sees only her own evidence, experience, certifications and journey", async () => {
    for (const table of ["skill_evidence", "project_experience", "certifications", "career_journey_entries"]) expect(await slugs(U.ana, table), table).toEqual(["ana"]);
    expect(await n(U.ana, "skill_evidence")).toBe(13);
  });
  it("sees ALL of her own interests, private included, and her own preferences", async () => {
    expect(await n(U.ana, "career_interests")).toBe(7);
    expect(await n(U.ana, "career_interests", "selected and not shared_with_staffing")).toBe(4);
    expect(await n(U.ana, "person_preferences")).toBe(1);
  });
  it("sees no opportunities, roles, reviewers, proposals, seats, reviews or shortlists", async () => {
    for (const table of ["opportunities", "role_requirements", "opportunity_delivery_leads", "team_proposals", "proposal_seats", "proposal_reviews", "shortlists"]) expect(await n(U.ana, table), table).toBe(0);
  });
  it("sees her own assignment and her own expression of interest, nobody else's", async () => {
    expect(await slugs(U.ana, "assignments")).toEqual(["ana"]);
    expect(await slugs(U.ana, "expressions_of_interest")).toEqual(["ana"]);
  });
  it("sees the history of her own evidence and nothing else from the audit log", async () => {
    const r = await seen(t.db, U.ana, "select distinct action, subject_person_id::text p from audit_log");
    expect(r).toEqual([{ action: "evidence.verify", p: P("ana") }]);
  });
  it("sees the name directory but not who owns which profile, and only her own roles", async () => {
    expect(await n(U.ana, "app_users")).toBe(7);
    expect(denied(await tryAs(t.db, U.ana, "select person_id from app_users"))).toMatch(/permission denied/);
    expect(await seen(t.db, U.ana, "select role::text r from user_roles")).toEqual([{ r: "engineer" }]);
  });
  it("knows who she is through my_identity(), which exposes her own link and roles only", async () => {
    const [me] = await seen(t.db, U.ana, "select public.my_identity() i");
    expect(me!.i).toEqual({ user_id: U.ana, display_name: "Ana Ruiz", person_id: P("ana"), roles: ["engineer"] });
  });
  it("another engineer (Lucía) is equally closed in: she cannot see Ana's anything", async () => {
    expect(await slugs(U.lucia)).toEqual(["lucia"]);
    expect(await n(U.lucia, "skill_evidence", "person_id = $1".replace("$1", `'${P("ana")}'`))).toBe(0);
    expect(await n(U.lucia, "career_interests")).toBe(0);
    expect(await n(U.lucia, "person_preferences")).toBe(0);
    expect(await n(U.lucia, "expressions_of_interest")).toBe(0);
  });
  it("the capabilities catalogue is shared reference data", async () => {
    expect(await n(U.ana, "capabilities")).toBe(37);
  });
});

describe("staffing lead (Laura): all profiles, only what people shared, her own proposals", () => {
  it("reads every profile with its evidence, experience, certifications and journey", async () => {
    expect(await n(U.laura, "people")).toBe(12);
    expect(await n(U.laura, "skill_evidence")).toBe(67);
    expect(await n(U.laura, "project_experience")).toBe(17);
  });
  it("sees interests ONLY where they are selected and shared: private ones are not returned, so they cannot even be counted", async () => {
    expect(await seen(t.db, U.laura, "select interest from career_interests")).toEqual([{ interest: "Applied AI in mobile" }]);
    expect(await n(U.laura, "career_interests")).toBe(1);
    expect(await n(U.laura, "career_interests", "interest = 'Fintech'")).toBe(0);
    expect((await seen(t.db, U.laura, "select count(*)::int n, count(distinct person_id)::int p from career_interests"))[0]).toEqual({ n: 1, p: 1 });
  });
  it("sees a professional preference only while it is shared", async () => {
    expect(await n(U.laura, "person_preferences")).toBe(1);
    await t.db.sql("update person_preferences set shared_with_staffing = false");
    expect(await n(U.laura, "person_preferences")).toBe(0);
  });
  it("sees opportunities, their roles, reviewers, all assignments and the shared expressions of interest", async () => {
    expect(await n(U.laura, "opportunities")).toBe(4);
    expect(await n(U.laura, "role_requirements")).toBe(12);
    expect(await n(U.laura, "opportunity_delivery_leads")).toBe(4);
    expect(await n(U.laura, "assignments")).toBe(11);
    expect(await n(U.laura, "expressions_of_interest")).toBe(1);
  });
  it("sees submitted proposals (and their seats and reviews), but another lead's DRAFT stays private to its author", async () => {
    expect(await n(U.laura, "team_proposals")).toBe(1);
    await t.db.sql("insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000b2')");
    await t.db.sql("insert into app_users (id, display_name) values ('00000000-0000-4000-8000-0000000000b2', 'Second Lead')");
    await t.db.sql("insert into user_roles (user_id, role) values ('00000000-0000-4000-8000-0000000000b2', 'staffing_lead')");
    await t.db.sql("insert into team_proposals (opportunity_id, title, created_by) values ($1, 'Private draft', '00000000-0000-4000-8000-0000000000b2')", [seedId("opportunity", "cobalt")]);
    expect(await seen(t.db, U.laura, "select title from team_proposals")).toEqual([{ title: "Vela Bank · AI-assisted onboarding" }]);
    expect(await n("00000000-0000-4000-8000-0000000000b2", "team_proposals")).toBe(2); // the author sees their draft and the submitted one
  });
  it("sees her own roles only, and her own shortlist only", async () => {
    expect(await seen(t.db, U.laura, "select role::text r from user_roles")).toEqual([{ r: "staffing_lead" }]);
    await t.db.sql("insert into shortlists (owner_id, person_id) values ($1, $2), ($3, $2)", [U.laura, P("ana"), U.rafael]);
    expect(await seen(t.db, U.laura, "select owner_id::text o from shortlists")).toEqual([{ o: U.laura }]);
  });
  it("sees verification history of anyone, and her own actions, but not permission changes made by an administrator", async () => {
    const actions = (await seen(t.db, U.laura, "select distinct action from audit_log order by 1")).map((r) => r.action);
    expect(actions).toEqual(["evidence.verify", "proposal.submit"]);
  });
});

describe("delivery lead: scoped to the opportunities and people they actually work with", () => {
  it("Rafael sees exactly the people he leads or has proposed for his opportunities, not the directory", async () => {
    expect(await slugs(U.rafael)).toEqual(["ana", "camila", "javier", "lucia", "sofia"]);
    expect(await slugs(U.ines)).toEqual(["daniel", "ethan", "marcus", "mateo", "priya", "tomas", "valentina"]);
  });
  it("their reach into evidence follows the same scope", async () => {
    expect(await slugs(U.rafael, "skill_evidence")).toEqual(["ana", "camila", "javier", "lucia", "sofia"]);
    expect(await n(U.rafael, "skill_evidence", `person_id = '${P("daniel")}'`)).toBe(0);
  });
  it("a delivery lead sees ONLY the opportunities they are assigned to, with their roles", async () => {
    expect((await seen(t.db, U.rafael, "select slug from opportunities order by slug")).map((r) => r.slug)).toEqual(["terra", "vela"]);
    expect((await seen(t.db, U.ines, "select slug from opportunities order by slug")).map((r) => r.slug)).toEqual(["cobalt", "nimbus"]);
    expect(await n(U.rafael, "role_requirements")).toBe(7);
  });
  it("sees the submitted proposal of their own opportunity, not another lead's", async () => {
    expect(await n(U.rafael, "team_proposals")).toBe(1);
    expect(await n(U.rafael, "proposal_seats")).toBe(4);
    expect(await n(U.ines, "team_proposals")).toBe(0);
  });
  it("sees the assignments they lead, and the shared expressions of interest on their own opportunities only", async () => {
    expect(await slugs(U.rafael, "assignments")).toEqual(["ana", "camila", "javier", "sofia"]);
    expect(await n(U.rafael, "expressions_of_interest")).toBe(1);
    expect(await n(U.ines, "expressions_of_interest")).toBe(0);
  });
  it("has NO access to career goals, learning interests or preferences, whatever the relationship", async () => {
    for (const who of [U.rafael, U.ines]) {
      expect(await n(who, "career_interests"), who).toBe(0);
      expect(await n(who, "person_preferences"), who).toBe(0);
      expect(await n(who, "shortlists"), who).toBe(0);
    }
  });
  it("the role alone opens nothing: a delivery lead with no assignments (Camila) sees only herself as an engineer", async () => {
    expect(await slugs(U.camila)).toEqual(["camila"]);
    expect(await n(U.camila, "opportunities")).toBe(0);
    expect(await n(U.camila, "team_proposals")).toBe(0);
  });
  it("their audit view is the verification history of the people they can review, plus their own actions", async () => {
    expect((await seen(t.db, U.ines, "select distinct action from audit_log order by 1")).map((r) => r.action)).toEqual(["assignment.confirm", "evidence.verify"]);
  });
});

describe("administrator: manages identity and reference data, and reads the audit log; sees no business data", () => {
  it("reads roles, reviewers, opportunities, the basic profile record and the whole audit log", async () => {
    expect(await n(U.admin, "user_roles")).toBe(8);
    expect(await n(U.admin, "opportunity_delivery_leads")).toBe(4);
    expect(await n(U.admin, "opportunities")).toBe(4);
    expect(await n(U.admin, "people")).toBe(12);
    expect(await n(U.admin, "audit_log")).toBe(90);
  });
  it("cannot read evidence, experience, interests, preferences, proposals, assignments or shortlists", async () => {
    for (const table of ["skill_evidence", "project_experience", "certifications", "career_journey_entries", "career_interests", "person_preferences", "team_proposals", "proposal_seats", "assignments", "shortlists", "expressions_of_interest"]) {
      expect(await n(U.admin, table), table).toBe(0);
    }
  });
});
