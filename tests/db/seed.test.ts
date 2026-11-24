/**
 * The seed is the fictional dataset, repeatable and deterministic. These tests tie the database to the same fixtures the app uses, so
 * the two never drift: 12 profiles, their evidence and verification states, shared-versus-private interests, availability, opportunities.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { careerInterests, evidence, people, projects } from "@/data/fixtures/people";
import { capabilities } from "@/data/fixtures/capabilities";
import { opportunities, users } from "@/data/fixtures/organization";
import { SEED_USERS, U, seedId } from "@/data/seed/ids";
import { buildSeedSql } from "@/data/seed/sql";
import { SEED_SQL } from "./harness";
import { withDb } from "./setup";

const t = withDb();
const sql = (q: string, p?: unknown[]) => t.db.sql(q, p);

describe("the committed seed", () => {
  it("is exactly what the generator produces from the fixtures (run `npm run db:seed:generate` when it fails)", () => {
    expect(readFileSync(SEED_SQL, "utf8")).toBe(buildSeedSql());
  });
  it("is generated deterministically", () => {
    expect(buildSeedSql()).toBe(buildSeedSql());
  });
  it("is repeatable: running it again changes nothing", async () => {
    const snap = async () => JSON.stringify(await sql(`select (select count(*) from people) p, (select count(*) from skill_evidence) e, (select count(*) from project_experience) pe,
      (select count(*) from audit_log) a, (select count(*) from assignments) s, (select count(*) from user_roles) r, (select count(*) from career_interests) i, (select count(*) from proposal_seats) ps`));
    const before = await snap();
    await t.db.exec(readFileSync(SEED_SQL, "utf8").replace(/^begin;$/m, "").replace(/^commit;$/m, ""));
    expect(await snap()).toBe(before);
  });
  it("uses deterministic UUID v5 ids derived from the fixture ids, so tests can name them", async () => {
    expect((await sql("select id::text from people where slug = 'ana'"))[0]!.id).toBe(seedId("person", "ana"));
    expect(seedId("person", "ana")).toBe(seedId("person", "ana"));
    expect(seedId("person", "ana")).not.toBe(seedId("person", "lucia"));
    const wrongVersion = await sql(`select slug from people where substr(id::text, 15, 1) <> '5'`);
    expect(wrongVersion).toEqual([]);
  });
});

describe("fixture parity: what the app shows is what the database holds", () => {
  it("12 professional profiles, with the same people and headlines", async () => {
    const r = await sql("select slug, name, headline, discipline::text d, years_experience y from people order by slug");
    expect(r).toEqual(people.map((p) => ({ slug: p.id, name: p.name, headline: p.headline, d: p.discipline, y: p.yearsExperience })).sort((a, b) => a.slug.localeCompare(b.slug)));
    expect(r).toHaveLength(12);
  });
  it("every skill evidence row, with its source AND its verification state", async () => {
    const r = await sql("select e.id::text id, p.slug, e.source::text s, e.verification::text v, e.label from skill_evidence e join people p on p.id = e.person_id");
    expect(r).toHaveLength(evidence.length);
    expect(evidence.length).toBe(67);
    const byId = new Map(r.map((x) => [x.id, x]));
    for (const e of evidence) {
      expect(byId.get(seedId("evidence", e.id)), e.id).toMatchObject({ slug: e.personId, s: e.level, v: e.verification, label: e.label });
    }
    const states = new Set(r.map((x) => x.v));
    expect([...states].sort()).toEqual(["pending", "self_reported", "verified"]);
  });
  it("professional experience, with who verified it", async () => {
    const r = await sql("select pe.id::text id, pe.verification::text v, u.display_name by from project_experience pe left join app_users u on u.id = pe.verified_by");
    expect(r).toHaveLength(projects.length);
    for (const p of projects) {
      const row = r.find((x) => x.id === seedId("project", p.id))!;
      expect(row.v, p.id).toBe(p.verification);
      if (p.verification === "verified") expect(row.by, p.id).toBe(p.verifiedBy!.split(",")[0]);
    }
  });
  it("capabilities, certifications and career journeys", async () => {
    expect((await sql("select count(*)::int n from capabilities"))[0]!.n).toBe(capabilities.length);
    expect((await sql("select count(*)::int n from certifications"))[0]!.n).toBe(people.reduce((n, p) => n + p.certifications.length, 0));
    expect((await sql("select count(*)::int n from career_journey_entries"))[0]!.n).toBe(people.reduce((n, p) => n + p.journey.length, 0));
  });
  it("interests keep their selected state, and ONLY what the person shared is shared", async () => {
    const r = await sql("select interest, selected, shared_with_staffing s from career_interests where person_id = $1 order by interest", [seedId("person", "ana")]);
    const fixture = careerInterests[0]!;
    expect(r).toHaveLength(Object.keys(fixture.interests).length);
    expect(r.filter((x) => x.s).map((x) => x.interest)).toEqual(fixture.shared);
    expect(r.filter((x) => x.s && !x.selected)).toEqual([]);
  });
  it("professional preferences: Ana's are shared, as in the fixtures", async () => {
    expect(await sql("select p.slug, pp.shared_with_staffing s from person_preferences pp join people p on p.id = pp.person_id")).toEqual([{ slug: "ana", s: true }]);
  });
  it("opportunities and their roles, with the delivery lead as a relation", async () => {
    const r = await sql("select o.slug, o.status::text st, count(rr.id)::int roles, u.display_name lead from opportunities o join role_requirements rr on rr.opportunity_id = o.id join opportunity_delivery_leads dl on dl.opportunity_id = o.id join app_users u on u.id = dl.user_id group by o.slug, o.status, u.display_name order by o.slug");
    expect(r).toEqual(opportunities.map((o) => ({ slug: o.id, st: o.status, roles: o.roles.length, lead: o.deliveryLead })).sort((a, b) => a.slug.localeCompare(b.slug)));
  });
  it("the Vela proposal: two proposed people, two open seats, submitted by the staffing lead, and NO assignment for either", async () => {
    expect(await sql("select state::text s, version v from team_proposals")).toEqual([{ s: "submitted", v: 1 }]);
    const seats = await sql("select rr.slug role, p.slug person, s.seat_state::text st from proposal_seats s join role_requirements rr on rr.id = s.role_requirement_id left join people p on p.id = s.person_id order by s.position");
    expect(seats).toEqual([
      { role: "vela-ai", person: "lucia", st: "proposed" }, { role: "vela-mobile", person: null, st: "open" },
      { role: "vela-backend", person: null, st: "open" }, { role: "vela-qa", person: "camila", st: "proposed" },
    ]);
    expect((await sql("select count(*)::int n from assignments where proposal_seat_id is not null"))[0]!.n).toBe(0);
    expect((await sql("select count(*)::int n from assignments where person_id = $1", [seedId("person", "lucia")]))[0]!.n).toBe(0);
  });
  it("Ana's expression of interest in the Vela mobile role is its own record, shared", async () => {
    expect(await sql("select p.slug, rr.slug role, e.status::text st from expressions_of_interest e join people p on p.id = e.person_id join role_requirements rr on rr.id = e.role_requirement_id")).toEqual([{ slug: "ana", role: "vela-mobile", st: "shared" }]);
  });
  it("the two domain personas exist as identities, linked to their profile; the extra identities are fictional and cannot sign in", async () => {
    const r = await sql("select u.display_name, p.slug person from app_users u left join people p on p.id = u.person_id order by u.display_name");
    for (const d of users) expect(r.find((x) => x.display_name === d.name)?.person ?? null, d.name).toBe(d.personId);
    expect(r).toHaveLength(SEED_USERS.length);
    expect((await sql("select count(*)::int n from auth.users where email not like '%@example.invalid'"))[0]!.n).toBe(0);
    expect(Object.keys(U)).toEqual(SEED_USERS.map((u) => u.key));
  });
  it("roles: engineers, one staffing lead, two delivery leads, one dual-role person, one administrator", async () => {
    const r = await sql("select u.display_name n, string_agg(r.role::text, ',' order by r.role::text) roles from user_roles r join app_users u on u.id = r.user_id group by u.display_name order by u.display_name");
    expect(Object.fromEntries(r.map((x) => [x.n, x.roles]))).toEqual({
      "Admin Demo": "admin", "Ana Ruiz": "engineer", "Camila Duarte": "delivery_lead,engineer", "Inés Vidal": "delivery_lead", "Laura Gómez": "staffing_lead",
      "Lucía Fernández": "engineer", "Rafael Ortiz": "delivery_lead",
    });
  });
  it("seeded history is consistent: every verified row has a verification event by the reviewer who verified it", async () => {
    const orphans = await sql(`select e.id from skill_evidence e where e.verification = 'verified' and not exists (select 1 from audit_log a where a.action = 'evidence.verify' and a.subject_id = e.id and a.actor_id = e.verified_by)
      union all select p.id from project_experience p where p.verification = 'verified' and not exists (select 1 from audit_log a where a.action = 'evidence.verify' and a.subject_id = p.id and a.actor_id = p.verified_by)`);
    expect(orphans).toEqual([]);
  });
  it("contains only fictional data: example.invalid emails and the invented seed dates", async () => {
    expect((await sql("select count(*)::int n from auth.users where email like '%@example.invalid'"))[0]!.n).toBe(SEED_USERS.length);
    expect(readFileSync(SEED_SQL, "utf8")).toMatch(/FICTIONAL DATA ONLY/);
  });
});
