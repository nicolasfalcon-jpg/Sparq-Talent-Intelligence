/**
 * Migration history and safety. 0001 is preserved byte for byte (it cannot be proven that it was never applied, so history only moves
 * forward), and the archive migration must be non-destructive on a database that DID load 0001.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BOOTSTRAP_SQL, MIGRATIONS_DIR, createDb, migrationFiles, sha256 } from "./harness";

const SHA_0001 = "cc7466a7432c03899e6cadadff1e3c685148cd3d64372a1ff90af953c498c432";

describe("migration history", () => {
  it("is a contiguous, ordered sequence", () => {
    const files = migrationFiles();
    expect(files.map((f) => f.slice(0, 4))).toEqual(files.map((_, i) => String(i + 1).padStart(4, "0")));
    expect(files).toEqual([
      "0001_initial_schema.sql", "0002_archive_initial_schema.sql", "0003_identity_and_talent.sql", "0004_staffing.sql", "0005_audit.sql",
      "0006_security_functions.sql", "0007_availability.sql", "0008_rls_and_grants.sql", "0009_copy_legacy_data.sql",
    ]);
  });
  it("preserves 0001 exactly as it was committed in phase 1 (history moves forward, it is never rewritten)", () => {
    expect(sha256(join(MIGRATIONS_DIR, "0001_initial_schema.sql"))).toBe(SHA_0001);
  });
  it("contains no destructive statement on application data: no DROP TABLE, TRUNCATE or DELETE outside the privileged functions", () => {
    for (const f of migrationFiles().slice(1)) {
      const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8").replace(/--.*$/gm, "");
      expect(sql, f).not.toMatch(/\bdrop\s+table\b/i);
      expect(sql, f).not.toMatch(/\btruncate\s+table\b/i);
      expect(sql, f).not.toMatch(/\bdrop\s+schema\b/i);
      expect(sql, f).not.toMatch(/\bdrop\s+column\b/i);
    }
  });
  it("applies cleanly, in order, to an empty Supabase-like database", async () => {
    const db = await createDb({ seed: false });
    expect(Number((await db.sql("select count(*)::int n from pg_tables where schemaname = 'public'"))[0]!.n)).toBeGreaterThan(15);
  });
  it("the bootstrap (our emulation of Supabase) is the only file that creates API roles", () => {
    expect(readFileSync(BOOTSTRAP_SQL, "utf8")).toMatch(/create role authenticated/);
    for (const f of migrationFiles()) expect(readFileSync(join(MIGRATIONS_DIR, f), "utf8"), f).not.toMatch(/create role/i);
  });
});

describe("archiving 0001 on a database that had loaded it", () => {
  const ANA = "56dd65b2-0d15-5b67-a6aa-8d45bd3c60ad";
  const REVIEWER = "d7b3f49e-5416-581c-96fc-25556c330743";
  async function legacyDb() {
    const db = await createDb({ migrations: 1, seed: false });
    await db.exec(`
      insert into auth.users (id, email) values ('${ANA}', 'ana@example.invalid'), ('${REVIEWER}', 'rafael@example.invalid');
      insert into capabilities (id, name, grp, aliases) values ('aws', 'AWS', 'cloud', '{aws}'), ('react-native', 'React Native', 'mobile', '{rn}');
      insert into people (id, name, headline, discipline, location, years_experience, summary, work_preferences, top_skills) values
        ('ana', 'Ana Ruiz', 'Senior Mobile Engineer', 'Mobile', 'Medellín', 9, 'Builds mobile products.', 'Open to travel up to 20%', '{React Native}'),
        ('lucia', 'Lucía Fernández', 'AI Engineer', 'AI', 'Mexico City', 7, 'Builds LLM apps.', null, '{}');
      insert into app_users (id, display_name, role, person_id) values ('${ANA}', 'Ana Ruiz', 'engineer', 'ana'), ('${REVIEWER}', 'Rafael Ortiz', 'delivery_lead', null);
      insert into skill_evidence (id, person_id, capability_id, label, level, detail, self_reported, confirmed_by, confirmed_at) values
        ('11111111-1111-4111-8111-111111111111', 'ana', 'react-native', 'React Native', 'professional', '5 projects', false, '${REVIEWER}', '2026-11-01T10:00:00Z'),
        ('22222222-2222-4222-8222-222222222222', 'ana', 'aws', 'AWS', 'independent', 'side project', true, null, null),
        ('33333333-3333-4333-8333-333333333333', 'ana', null, 'Haskell', 'training', 'course', false, '${REVIEWER}', null);
      insert into project_experience (id, person_id, period, client, role, title, source, confirmed_by) values
        ('44444444-4444-4444-8444-444444444444', 'ana', '2025', 'Meridian Health', 'Lead', 'Companion app', 'Confirmed by Rafael', '${REVIEWER}'),
        ('55555555-5555-4555-8555-555555555555', 'ana', '2024', 'Open source', 'Author', 'rn-offline-queue', 'self-reported', null);
      insert into career_interests (person_id, interest, selected) values ('ana', 'Fintech', true), ('ana', 'Mentoring', false);
      insert into opportunities (id, client, client_initials, industry, name, short, description, status, kickoff, duration_months, delivery_lead) values ('vela', 'Vela Bank', 'VB', 'Financial services', 'Onboarding', 'Short', 'Long description', 'Staffing', '2027-01-12', 6, 'Rafael Ortiz');
      insert into role_requirements (id, opportunity_id, title, allocation_pct, proposed_person_id) values ('vela-mobile', 'vela', 'Mobile', 50, 'ana');
      insert into assignments (person_id, project_name, starts_on, ends_on, delivery_lead) values ('ana', 'Meridian Health', '2025-01-06', '2026-12-19', 'Rafael Ortiz');
      insert into availability (person_id, available_from, status) values ('ana', '2027-01-05', 'confirmed');
      insert into team_proposals (id, opportunity_id, title, status, created_by, reviewer) values
        ('66666666-6666-4666-8666-666666666666', 'vela', 'A draft', 'draft', '${ANA}', null),
        ('77777777-7777-4777-8777-777777777777', 'vela', 'Sent for review', 'in_review', '${ANA}', 'Rafael Ortiz'),
        ('88888888-8888-4888-8888-888888888888', 'vela', 'Approved before any human review existed', 'approved', '${ANA}', 'Rafael Ortiz');
      insert into proposal_seats (proposal_id, role_title, person_id, seat_state) values ('66666666-6666-4666-8666-666666666666', 'Mobile', 'ana', 'proposed');
      insert into expressions_of_interest (person_id, role_requirement_id, note, shared_with_staffing) values ('ana', 'vela-mobile', 'interested', true);
    `);
    return db;
  }

  it("moves, never drops: every legacy row is still there afterwards", async () => {
    const db = await legacyDb();
    const tables = ["people", "skill_evidence", "project_experience", "career_interests", "opportunities", "role_requirements", "assignments", "availability", "team_proposals", "proposal_seats", "expressions_of_interest", "app_users", "capabilities"];
    const before = Object.fromEntries(await Promise.all(tables.map(async (t) => [t, Number((await db.sql(`select count(*)::int n from public.${t}`))[0]!.n)])));
    for (const f of migrationFiles().slice(1)) await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
    for (const t of tables) expect(Number((await db.sql(`select count(*)::int n from legacy_0001.${t}`))[0]!.n), t).toBe(before[t]);
  });

  it("copies what is safe, converts ids, and never upgrades trust", async () => {
    const db = await legacyDb();
    for (const f of migrationFiles().slice(1)) await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
    expect((await db.sql("select slug from people order by slug")).map((r) => r.slug)).toEqual(["ana", "lucia"]);
    const ev = await db.sql("select label, source, verification, verified_by::text vb from skill_evidence order by label");
    expect(ev).toEqual([
      { label: "AWS", source: "independent", verification: "self_reported", vb: null },
      { label: "Haskell", source: "training", verification: "self_reported", vb: null }, // reviewer recorded but no timestamp: NOT verified
      { label: "React Native", source: "professional", verification: "verified", vb: REVIEWER },
    ]);
    expect(await db.sql("select title, verification from project_experience order by title")).toEqual([
      { title: "Companion app", verification: "verified" }, { title: "rn-offline-queue", verification: "self_reported" },
    ]);
    // Private by default: the legacy column becomes a row that is NOT shared; interests are not shared either.
    expect(await db.sql("select work_preferences, shared_with_staffing from person_preferences")).toEqual([{ work_preferences: "Open to travel up to 20%", shared_with_staffing: false }]);
    expect(await db.sql("select interest, selected, shared_with_staffing from career_interests order by interest")).toEqual([
      { interest: "Fintech", selected: true, shared_with_staffing: false }, { interest: "Mentoring", selected: false, shared_with_staffing: false },
    ]);
    expect((await db.sql("select allocation::text a from role_requirements"))[0]!.a).toBe("0.500");
    expect(await db.sql("select slug from opportunities")).toEqual([{ slug: "vela" }]);
    expect((await db.sql("select count(*)::int n from opportunity_delivery_leads"))[0]!.n).toBe(1); // matched by name to the delivery lead
  });

  it("does NOT promote what lacks a human decision: assignments, in-review and approved proposals stay in the archive", async () => {
    const db = await legacyDb();
    for (const f of migrationFiles().slice(1)) await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
    expect((await db.sql("select count(*)::int n from public.assignments"))[0]!.n).toBe(0);
    expect(await db.sql("select title, state from team_proposals")).toEqual([{ title: "A draft", state: "draft" }]);
    expect((await db.sql("select count(*)::int n from proposal_reviews"))[0]!.n).toBe(0);
    expect((await db.sql("select count(*)::int n from proposal_seats"))[0]!.n).toBe(1);
    expect((await db.sql("select count(*)::int n from legacy_0001.team_proposals"))[0]!.n).toBe(3);
  });

  it("is re-runnable: running the copy again changes nothing", async () => {
    const db = await legacyDb();
    for (const f of migrationFiles().slice(1)) await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
    const snapshot = async () => JSON.stringify(await db.sql("select (select count(*) from people) p, (select count(*) from skill_evidence) e, (select count(*) from team_proposals) t, (select count(*) from career_interests) i"));
    const before = await snapshot();
    await db.exec(readFileSync(join(MIGRATIONS_DIR, "0009_copy_legacy_data.sql"), "utf8"));
    expect(await snapshot()).toBe(before);
  });

  it("locks the archive: API roles cannot even see the schema", async () => {
    const db = await legacyDb();
    for (const f of migrationFiles().slice(1)) await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
    for (const who of ["anon", ANA]) {
      const r = await db.as(who, (q) => q("select * from legacy_0001.people").then(() => "readable", (e: Error) => e.message));
      expect(r, who).toMatch(/permission denied/);
    }
  });
});
