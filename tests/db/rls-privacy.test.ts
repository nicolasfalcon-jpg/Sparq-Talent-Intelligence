/**
 * Privacy policy, enforced by the database (not by the application): career goals and learning interests are private by default;
 * preferences are shared voluntarily and can be withdrawn; interest in a specific opportunity is a separate record; private data
 * does not leak through staffing queries, aggregates, functions or exports.
 */
import { describe, expect, it } from "vitest";
import { U, seedId } from "@/data/seed/ids";
import { denied, seen, tryAs, withDb } from "./setup";

const t = withDb();
const P = (slug: string) => seedId("person", slug);
const staffInterests = async () => (await seen(t.db, U.laura, "select interest from career_interests order by interest")).map((r) => r.interest as string);
const ana = (sql: string, params?: unknown[]) => tryAs(t.db, U.ana, sql, params);

describe("career goals and learning interests", () => {
  it("are private by default: staffing sees only what Ana shared, and nothing of the rest", async () => {
    expect(await staffInterests()).toEqual(["Applied AI in mobile"]);
  });
  it("a new interest is invisible to staffing until its owner shares it", async () => {
    expect((await ana("insert into career_interests (person_id, interest) values ($1, 'Robotics') returning shared_with_staffing s", [P("ana")])).ok).toBe(true);
    expect(await staffInterests()).toEqual(["Applied AI in mobile"]);
  });
  it("sharing is the owner's choice, takes effect on the next query, and can be withdrawn at once", async () => {
    await ana("update career_interests set shared_with_staffing = true where person_id = $1 and interest = 'Fintech'", [P("ana")]);
    expect(await staffInterests()).toEqual(["Applied AI in mobile", "Fintech"]);
    await ana("update career_interests set shared_with_staffing = false where person_id = $1 and interest = 'Fintech'", [P("ana")]);
    expect(await staffInterests()).toEqual(["Applied AI in mobile"]);
  });
  it("deselecting a shared interest withdraws it, and selecting it again does NOT re-share it", async () => {
    await ana("update career_interests set selected = false where person_id = $1 and interest = 'Applied AI in mobile'", [P("ana")]);
    expect(await staffInterests()).toEqual([]);
    await ana("update career_interests set selected = true where person_id = $1 and interest = 'Applied AI in mobile'", [P("ana")]);
    expect(await staffInterests()).toEqual([]); // back to private
    expect((await seen(t.db, U.ana, "select shared_with_staffing s from career_interests where interest = 'Applied AI in mobile'"))[0]!.s).toBe(false);
  });
  it("an interest that is not selected can never be shared", async () => {
    await ana("update career_interests set shared_with_staffing = true where person_id = $1 and interest = 'Native iOS depth'", [P("ana")]);
    expect(await staffInterests()).toEqual(["Applied AI in mobile"]);
  });
  it("staff cannot create, change, share or delete anyone's interests (not even to 'help')", async () => {
    expect(denied(await tryAs(t.db, U.laura, `insert into career_interests (person_id, interest) values ('${P("ana")}', 'Planted')`))).toMatch(/row-level security/);
    expect((await seen(t.db, U.laura, "update career_interests set shared_with_staffing = true returning interest")).length).toBe(0);
    expect((await seen(t.db, U.laura, "delete from career_interests returning interest")).length).toBe(0);
    expect((await t.db.sql("select count(*)::int n from career_interests where shared_with_staffing"))[0]!.n).toBe(1);
  });
  it("another engineer cannot read or alter them either", async () => {
    expect((await seen(t.db, U.lucia, "select count(*)::int n from career_interests"))[0]!.n).toBe(0);
    expect((await seen(t.db, U.lucia, "update career_interests set shared_with_staffing = true returning interest")).length).toBe(0);
    expect(denied(await tryAs(t.db, U.lucia, `insert into career_interests (person_id, interest) values ('${P("ana")}', 'Planted')`))).toMatch(/row-level security/);
  });
  it("delivery leads and administrators see none, even for people they review", async () => {
    for (const who of [U.rafael, U.ines, U.admin, U.camila]) expect((await seen(t.db, who, "select count(*)::int n from career_interests"))[0]!.n, who).toBe(0);
  });
});

describe("no side door: aggregates, joins, functions and views do not leak private rows", () => {
  const sneaky = [
    "select count(*)::int n from career_interests",
    "select count(*)::int n from career_interests where not shared_with_staffing",
    "select count(*)::int n from career_interests where selected",
    "select count(distinct interest)::int n from career_interests",
    "select count(*)::int n from people p join career_interests c on c.person_id = p.id",
    "select count(*)::int n from people p where exists (select 1 from career_interests c where c.person_id = p.id and c.interest = 'Fintech')",
    "select count(*)::int n from people p where p.id in (select person_id from career_interests where interest = 'Mentoring')",
    "select count(*)::int n from career_interests c, lateral (select 1) x where c.interest ilike 'tech%'",
  ];
  it.each(sneaky)("for staff, `%s` cannot reveal a private interest", async (sql) => {
    const expected = /not shared_with_staffing|Fintech|Mentoring|tech%/.test(sql) ? 0 : 1;
    expect((await seen(t.db, U.laura, sql))[0]!.n).toBe(expected);
  });
  it("there is no view or exported function in the API schema that returns interests or preferences", async () => {
    expect(await t.db.sql("select viewname from pg_views where schemaname = 'public'")).toEqual([]);
    const fns = await t.db.sql(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
      and p.prokind = 'f' and (case when p.prokind = 'f' then pg_get_functiondef(p.oid) end) ~* '(career_interests|person_preferences)'`);
    expect(fns).toEqual([]);
  });
  it("the audit log never contains private interest labels or preferences", async () => {
    const leaks = await t.db.sql("select id from audit_log where details::text ~* '(fintech|mentoring|technical leadership|open to travel)'");
    expect(leaks).toEqual([]);
  });
});

describe("professional preferences are disclosed voluntarily and can be withdrawn", () => {
  const staffPrefs = async () => (await seen(t.db, U.laura, "select work_preferences w from person_preferences")).map((r) => r.w as string);
  it("staff see Ana's, because she shares them; others see nothing", async () => {
    expect(await staffPrefs()).toEqual(["Open to travel up to 20% · enjoys teams of 4–8"]);
    for (const who of [U.lucia, U.rafael, U.admin]) expect((await seen(t.db, who, "select count(*)::int n from person_preferences"))[0]!.n, who).toBe(0);
  });
  it("withdrawing hides them from the next query; sharing again restores them", async () => {
    await ana("update person_preferences set shared_with_staffing = false where person_id = $1", [P("ana")]);
    expect(await staffPrefs()).toEqual([]);
    expect((await seen(t.db, U.ana, "select work_preferences from person_preferences")).length).toBe(1); // still hers
    await ana("update person_preferences set shared_with_staffing = true where person_id = $1", [P("ana")]);
    expect(await staffPrefs()).toHaveLength(1);
  });
  it("a new preference is private until shared", async () => {
    expect((await tryAs(t.db, U.lucia, "insert into person_preferences (person_id, work_preferences) values ($1, 'Remote only') returning shared_with_staffing s", [P("lucia")])).ok).toBe(true);
    expect(await staffPrefs()).toHaveLength(1); // still only Ana's
  });
  it("staff cannot write them, and nobody can write someone else's", async () => {
    expect((await seen(t.db, U.laura, "update person_preferences set shared_with_staffing = false returning person_id")).length).toBe(0);
    expect(denied(await tryAs(t.db, U.laura, `insert into person_preferences (person_id, work_preferences) values ('${P("lucia")}', 'x')`))).toMatch(/row-level security/);
    expect(denied(await tryAs(t.db, U.lucia, `insert into person_preferences (person_id, work_preferences) values ('${P("camila")}', 'x')`))).toMatch(/row-level security/);
  });
  it("the staff profile row carries NO preference column: there is nothing to select around the policy", async () => {
    const cols = (await t.db.sql("select attname from pg_attribute where attrelid = 'public.people'::regclass and attnum > 0 and not attisdropped")).map((r) => r.attname);
    expect(cols.filter((c: string) => /prefer|interest|goal/i.test(c))).toEqual([]);
  });
});

describe("expression of interest in a specific opportunity is a separate record", () => {
  const COBALT_IOS = seedId("role", "cobalt-ios"); // Cobalt is 'Open'
  const NIMBUS = seedId("role", "nimbus-arch"); // Nimbus is 'Upcoming': not open for interest yet
  it("exists only because the person created it; stakeholders see it while shared and never see career goals through it", async () => {
    expect((await seen(t.db, U.laura, "select count(*)::int n from expressions_of_interest"))[0]!.n).toBe(1);
    expect((await seen(t.db, U.rafael, "select count(*)::int n from expressions_of_interest"))[0]!.n).toBe(1); // he leads Vela
    expect((await seen(t.db, U.ines, "select count(*)::int n from expressions_of_interest"))[0]!.n).toBe(0); // she does not
    expect((await seen(t.db, U.lucia, "select count(*)::int n from expressions_of_interest"))[0]!.n).toBe(0);
    expect(await staffInterests()).toEqual(["Applied AI in mobile"]); // unaffected by the expression
  });
  it("withdrawing hides it from every stakeholder at once; re-sharing brings it back", async () => {
    await ana("update expressions_of_interest set status = 'withdrawn' where person_id = $1", [P("ana")]);
    for (const who of [U.laura, U.rafael]) expect((await seen(t.db, who, "select count(*)::int n from expressions_of_interest"))[0]!.n, who).toBe(0);
    expect((await seen(t.db, U.ana, "select status::text s, withdrawn_at is not null w from expressions_of_interest"))[0]).toEqual({ s: "withdrawn", w: true });
    await ana("update expressions_of_interest set status = 'shared' where person_id = $1", [P("ana")]);
    expect((await seen(t.db, U.laura, "select count(*)::int n from expressions_of_interest"))[0]!.n).toBe(1);
  });
  it("a person expresses interest only for themselves, and only in a role that is open for interest", async () => {
    expect((await ana("insert into expressions_of_interest (person_id, role_requirement_id, note) values ($1, $2, 'Keen') returning id", [P("ana"), COBALT_IOS])).ok).toBe(true);
    expect(denied(await ana("insert into expressions_of_interest (person_id, role_requirement_id) values ($1, $2)", [P("lucia"), COBALT_IOS]))).toMatch(/row-level security/);
    expect(denied(await ana("insert into expressions_of_interest (person_id, role_requirement_id) values ($1, $2)", [P("ana"), NIMBUS]))).toMatch(/row-level security/);
    expect(denied(await tryAs(t.db, U.laura, "insert into expressions_of_interest (person_id, role_requirement_id) values ($1, $2)", [P("ana"), COBALT_IOS]))).toMatch(/row-level security/);
  });
  it("it cannot be created already 'withdrawn', retargeted to another person or role, or have its stamp forged", async () => {
    expect(denied(await ana("insert into expressions_of_interest (person_id, role_requirement_id, status) values ($1, $2, 'withdrawn')", [P("ana"), COBALT_IOS]))).toMatch(/permission denied/);
    for (const set of [`person_id = '${P("lucia")}'`, `role_requirement_id = '${COBALT_IOS}'`, "withdrawn_at = now()"]) {
      expect(denied(await ana(`update expressions_of_interest set ${set} where person_id = $1`, [P("ana")])), set).toMatch(/permission denied/);
    }
  });
});
