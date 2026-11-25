/**
 * The migration runner (scripts/db/migrate.mjs): history tracking, checksum drift, baseline, dry-run, transactions, the advisory lock and
 * the fictional-project guard. Logic is tested on throwaway PGlite databases through the same adapter interface the real `pg` client uses.
 */
import { PGlite } from "@electric-sql/pglite";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEnvFile } from "../../scripts/db/env.mjs";
import { GuardError, assertConfirmedProject, projectRefFromDbUrl, projectRefFromHttpUrl } from "../../scripts/db/guard.mjs";
import { MigrationError, migrate, parseArgs, pgliteDb, prepareTarget, readMigrationFiles, sha256, type MigrationFile } from "../../scripts/db/migrate.mjs";
import { demoAuthUsersSql } from "../../scripts/db/seed-users.mjs";
import { BOOTSTRAP_SQL, MIGRATIONS_DIR, SEED_SQL } from "./harness";

const file = (name: string, sql: string): MigrationFile => ({ name, sql, sha: sha256(sql) });
const TINY = [
  file("0001_a.sql", "create table t_a (id int primary key);"),
  file("0002_b.sql", "create table t_b (id int primary key); insert into t_b values (1);"),
  file("0003_c.sql", "create table t_c (id int primary key);"),
];
const fresh = () => { const pg = new PGlite(); return { pg, db: pgliteDb(pg) }; };
const tables = async (pg: PGlite) => (await pg.query("select tablename from pg_tables where schemaname = 'public' order by 1")).rows.map((r) => (r as { tablename: string }).tablename);
const history = async (pg: PGlite) => (await pg.query("select filename, sha256, applied_by from sparq_migrations.applied order by filename")).rows as { filename: string; sha256: string; applied_by: string }[];

describe("applying and tracking", () => {
  it("applies pending migrations in order, records each with its checksum, and a second run does nothing", async () => {
    const { pg, db } = fresh();
    const r = await migrate(db, { files: TINY });
    expect(r.ran).toEqual(["0001_a.sql", "0002_b.sql", "0003_c.sql"]);
    expect(await tables(pg)).toEqual(["t_a", "t_b", "t_c"]);
    expect((await history(pg)).map((h) => [h.filename, h.sha256])).toEqual(TINY.map((f) => [f.name, f.sha]));
    const again = await migrate(db, { files: TINY });
    expect(again.ran).toEqual([]);
    expect((await history(pg)).length).toBe(3);
  });
  it("applies only what is new after more files arrive", async () => {
    const { pg, db } = fresh();
    await migrate(db, { files: TINY.slice(0, 2) });
    const r = await migrate(db, { files: TINY });
    expect(r.ran).toEqual(["0003_c.sql"]);
    expect(await tables(pg)).toEqual(["t_a", "t_b", "t_c"]);
  });
  it("refuses an applied migration that changed on disk, and applies nothing", async () => {
    const { pg, db } = fresh();
    await migrate(db, { files: TINY.slice(0, 2) });
    const edited = [TINY[0]!, file("0002_b.sql", "create table t_b (id int primary key); insert into t_b values (2);"), TINY[2]!];
    await expect(migrate(db, { files: edited })).rejects.toThrow(/changed after it was applied.*add a new migration/s);
    expect(await tables(pg)).toEqual(["t_a", "t_b"]);
  });
  it("refuses a recorded migration whose file is gone, and an out-of-order history", async () => {
    const { pg, db } = fresh();
    await migrate(db, { files: TINY });
    await expect(migrate(db, { files: TINY.slice(0, 2) })).rejects.toThrow(/missing from supabase\/migrations/);
    await pg.exec("delete from sparq_migrations.applied where filename = '0002_b.sql'");
    await expect(migrate(db, { files: TINY })).rejects.toThrow(/out of order/);
  });
  it("the history table is closed to the API roles", async () => {
    const pg = new PGlite();
    await pg.exec(readFileSync(BOOTSTRAP_SQL, "utf8"));
    await migrate(pgliteDb(pg), { files: TINY.slice(0, 1) });
    for (const role of ["anon", "authenticated", "service_role"]) {
      const r = (await pg.query("select has_table_privilege($1, 'sparq_migrations.applied', 'select, insert, update, delete') t, has_schema_privilege($1, 'sparq_migrations', 'usage') s", [role])).rows[0];
      expect(r, role).toEqual({ t: false, s: false });
    }
    expect((await pg.query("select relrowsecurity from pg_class where oid = 'sparq_migrations.applied'::regclass")).rows[0]).toEqual({ relrowsecurity: true });
  });
});

describe("transactions and recovery", () => {
  const broken = [TINY[0]!, file("0002_b.sql", "create table t_b (id int primary key); select 1 / 0;"), TINY[2]!];
  it("a failing migration is rolled back completely, later ones are not attempted, and earlier ones stay recorded", async () => {
    const { pg, db } = fresh();
    await expect(migrate(db, { files: broken })).rejects.toThrow(/0002_b\.sql failed and was rolled back.*division by zero/s);
    expect(await tables(pg)).toEqual(["t_a"]);
    expect((await history(pg)).map((h) => h.filename)).toEqual(["0001_a.sql"]);
  });
  it("rerunning after the migration is fixed is safe and finishes the job", async () => {
    const { pg, db } = fresh();
    await expect(migrate(db, { files: broken })).rejects.toThrow(MigrationError);
    const r = await migrate(db, { files: TINY });
    expect(r.ran).toEqual(["0002_b.sql", "0003_c.sql"]);
    expect(await tables(pg)).toEqual(["t_a", "t_b", "t_c"]);
  });
  it("refuses to run while another run holds the advisory lock", async () => {
    const { db } = fresh();
    const locked = { ...db, query: (sql: string, p?: unknown[]) => (sql.includes("pg_try_advisory_lock") ? Promise.resolve([{ ok: false }]) : db.query(sql, p)) };
    await expect(migrate(locked, { files: TINY })).rejects.toThrow(/Another migration run holds the lock/);
  });
  it("takes and releases the advisory lock around a real run", async () => {
    const { db } = fresh();
    const seen: string[] = [];
    const spy = { ...db, query: (sql: string, p?: unknown[]) => { if (/advisory/.test(sql)) seen.push(/unlock/.test(sql) ? "unlock" : "lock"); return db.query(sql, p); } };
    await migrate(spy, { files: TINY });
    expect(seen).toEqual(["lock", "unlock"]);
  });
});

describe("a database that already has the schema but no history", () => {
  const installed = async () => { const x = fresh(); await x.pg.exec("create table public.people (id int primary key); create table public.t_a (id int primary key);"); return x; };
  it("is refused, with an explanation, unless it is baselined explicitly (no blind replay)", async () => {
    const { pg, db } = await installed();
    await expect(migrate(db, { files: TINY })).rejects.toThrow(/NOT replay migrations blindly.*--baseline=/s);
    expect((await pg.query("select to_regclass('sparq_migrations.applied') r")).rows[0]).toEqual({ r: null });
  });
  it("--baseline records the migrations up to a file WITHOUT executing them, then applies the rest", async () => {
    const { pg, db } = await installed();
    const r = await migrate(db, { files: TINY, baseline: "0002_b.sql" });
    expect(r.ran).toEqual(["0003_c.sql"]);
    expect(await tables(pg)).toEqual(["people", "t_a", "t_c"]); // t_b was NOT created: it was recorded, not replayed
    expect((await history(pg)).map((h) => [h.filename, h.applied_by])).toEqual([["0001_a.sql", "sparq-migrate (baseline)"], ["0002_b.sql", "sparq-migrate (baseline)"], ["0003_c.sql", "sparq-migrate"]]);
  });
  it("--baseline must name a real migration, and is refused once there is history", async () => {
    const { db } = await installed();
    await expect(migrate(db, { files: TINY, baseline: "0099_nope.sql" })).rejects.toThrow(/not a migration file/);
    const x = fresh();
    await migrate(x.db, { files: TINY });
    await expect(migrate(x.db, { files: TINY, baseline: "0001_a.sql" })).rejects.toThrow(/only for a database without migration history/);
  });
  it("an empty database (a new Supabase project) needs no baseline", async () => {
    const { db } = fresh();
    await expect(migrate(db, { files: TINY })).resolves.toMatchObject({ ran: ["0001_a.sql", "0002_b.sql", "0003_c.sql"] });
  });
});

describe("status and dry-run change nothing", () => {
  it("--status reports applied and pending without creating the history table", async () => {
    const { pg, db } = fresh();
    const lines: string[] = [];
    const r = await migrate(db, { files: TINY, status: true, log: (m) => lines.push(m) });
    expect(r.pending).toEqual(["0001_a.sql", "0002_b.sql", "0003_c.sql"]);
    expect(await tables(pg)).toEqual([]);
    expect((await pg.query("select to_regclass('sparq_migrations.applied') r")).rows[0]).toEqual({ r: null });
    expect(lines.join("\n")).toMatch(/→ pending .*0001_a\.sql/);
  });
  it("--dry-run prints the plan (and the seed) after a partial apply, and still changes nothing", async () => {
    const { pg, db } = fresh();
    await migrate(db, { files: TINY.slice(0, 1) });
    const lines: string[] = [];
    const r = await migrate(db, { files: TINY, dryRun: true, seedSql: "select 1/0;", log: (m) => lines.push(m) });
    expect(r).toMatchObject({ applied: ["0001_a.sql"], pending: ["0002_b.sql", "0003_c.sql"], ran: [], seeded: false });
    expect(await tables(pg)).toEqual(["t_a"]);
    expect(lines.join("\n")).toMatch(/✓ applied .*0001_a\.sql/);
    expect(lines.join("\n")).toMatch(/Would apply supabase\/seed\.sql/);
  });
});

describe("the real migrations and the seed through the runner", () => {
  it("apply to an empty Supabase-like database, the seed refuses without the provisioned accounts, then runs (twice, idempotent)", async () => {
    const pg = new PGlite();
    await pg.exec(readFileSync(BOOTSTRAP_SQL, "utf8"));
    const db = pgliteDb(pg);
    const files = readMigrationFiles(MIGRATIONS_DIR);
    expect(files.length).toBe(11);
    const seedSql = readFileSync(SEED_SQL, "utf8");
    await expect(migrate(db, { files, seedSql })).rejects.toThrow(/seed failed and was rolled back.*demo account\(s\) missing from auth\.users.*db:provision/s);
    expect((await history(pg)).length).toBe(11); // migrations stay applied; only the seed was rolled back
    expect((await pg.query("select count(*)::int n from public.people")).rows[0]).toEqual({ n: 0 });
    await pg.exec(demoAuthUsersSql());
    const r = await migrate(db, { files, seedSql });
    expect(r).toMatchObject({ ran: [], seeded: true });
    expect((await pg.query("select count(*)::int n from public.people")).rows[0]).toEqual({ n: 12 });
    await migrate(db, { files, seedSql });
    expect((await pg.query("select count(*)::int n from public.people")).rows[0]).toEqual({ n: 12 });
    expect((await pg.query("select count(*)::int n from public.user_roles")).rows[0]).toEqual({ n: 7 });
  });
  it("readMigrationFiles refuses a gap in the numbering", () => {
    const dir = mkdtempSync(join(tmpdir(), "mig-"));
    writeFileSync(join(dir, "0001_a.sql"), "select 1;");
    writeFileSync(join(dir, "0003_c.sql"), "select 1;");
    expect(() => readMigrationFiles(dir)).toThrow(/numbered contiguously/);
  });
});

describe("the fictional-project guard", () => {
  const POOLER = "postgresql://postgres.abcdefghijklmnop:s3cr3t-Pa55@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
  const DIRECT = "postgresql://postgres:s3cr3t-Pa55@db.abcdefghijklmnop.supabase.co:5432/postgres";
  it("derives the project ref from a pooler URL, a direct URL, or recognises a local database", () => {
    expect(projectRefFromDbUrl(POOLER)).toMatchObject({ ref: "abcdefghijklmnop", local: false });
    expect(projectRefFromDbUrl(DIRECT)).toMatchObject({ ref: "abcdefghijklmnop", local: false });
    expect(projectRefFromDbUrl("postgresql://postgres:postgres@127.0.0.1:54322/postgres")).toMatchObject({ ref: "local", local: true });
    expect(projectRefFromDbUrl("postgresql://postgres:postgres@localhost:5432/postgres")).toMatchObject({ local: true });
    expect(projectRefFromHttpUrl("https://abcdefghijklmnop.supabase.co")).toMatchObject({ ref: "abcdefghijklmnop" });
    expect(projectRefFromHttpUrl("http://127.0.0.1:54321")).toMatchObject({ local: true });
  });
  it("refuses a host it cannot attribute to a project (a lookalike is not a project)", () => {
    for (const bad of ["postgresql://u:p@db.example.com:5432/postgres", "postgresql://postgres:p@db.abcdefghijklmnop.supabase.co.evil.com:5432/postgres", "postgresql://u:p@aws-0.pooler.supabase.com/postgres", "not a url"]) {
      expect(() => projectRefFromDbUrl(bad), bad).toThrow(GuardError);
    }
    expect(() => projectRefFromHttpUrl("https://example.com")).toThrow(GuardError);
    expect(() => projectRefFromHttpUrl("https://abcdefghijklmnop.supabase.co.evil.com")).toThrow(GuardError);
  });
  it("runs against a remote project only when the human confirmed exactly that ref", () => {
    const t = projectRefFromDbUrl(POOLER);
    expect(() => assertConfirmedProject(t, {})).toThrow(/has not been confirmed.*SPARQ_CONFIRM_FICTIONAL_PROJECT=abcdefghijklmnop/s);
    expect(() => assertConfirmedProject(t, { SPARQ_CONFIRM_FICTIONAL_PROJECT: "someotherproject" })).toThrow(/does not match/);
    expect(() => assertConfirmedProject(t, { SPARQ_CONFIRM_FICTIONAL_PROJECT: "abcdefghijklmnop" })).not.toThrow();
    expect(() => assertConfirmedProject(projectRefFromDbUrl("postgresql://postgres:postgres@127.0.0.1:54322/postgres"), {})).not.toThrow();
  });
  it("prepareTarget enforces it, and neither it nor any error ever contains the password", () => {
    expect(() => prepareTarget({})).toThrow(/SUPABASE_DB_URL is not set/);
    let message = "";
    try { prepareTarget({ SUPABASE_DB_URL: POOLER }); } catch (e) { message = (e as Error).message; }
    expect(message).toMatch(/not been confirmed/);
    expect(message).not.toContain("s3cr3t");
    const ok = prepareTarget({ SUPABASE_DB_URL: DIRECT + "?sslmode=require", SPARQ_CONFIRM_FICTIONAL_PROJECT: "abcdefghijklmnop" });
    expect(ok.target).toEqual({ ref: "abcdefghijklmnop", host: "db.abcdefghijklmnop.supabase.co", local: false });
    expect(ok.connectionString).not.toMatch(/sslmode/);
    expect(ok.ssl).toEqual({ rejectUnauthorized: false });
    expect(prepareTarget({ SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" }).ssl).toBe(false);
  });
});

describe("small helpers", () => {
  it("parseArgs accepts the documented flags and rejects anything else", () => {
    expect(parseArgs(["--dry-run", "--seed", "--baseline=0009_x.sql"])).toEqual({ status: false, dryRun: true, seed: true, baseline: "0009_x.sql" });
    expect(() => parseArgs(["--force"])).toThrow(/Unknown option/);
  });
  it("parseEnvFile reads KEY=VALUE lines, comments and quotes", () => {
    expect(parseEnvFile(`# c\nA=1\nexport B="two words"\nC='x'\n\nbad line\nD=`)).toEqual({ A: "1", B: "two words", C: "x", D: "" });
  });
});
