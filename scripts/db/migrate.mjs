#!/usr/bin/env node
// Migration runner with HISTORY TRACKING for the dedicated Supabase development project (and local databases).
//
//   node scripts/db/migrate.mjs --status                 what is applied and what is pending (read-only)
//   node scripts/db/migrate.mjs --dry-run [--seed]       print the plan, change nothing
//   node scripts/db/migrate.mjs [--seed]                 apply pending migrations in order, then optionally the (idempotent) seed
//   node scripts/db/migrate.mjs --baseline=<file>        adopt a database that already has the schema WITHOUT replaying it
//
// Guarantees: every migration runs in ONE transaction together with its history row (a failure leaves nothing half-applied and a
// re-run is safe); an applied file that changed on disk is refused (never edit an applied migration: add a new one); an advisory
// lock stops two runs from interleaving; a database that has the schema but no history is refused unless you baseline it explicitly;
// and the target must be CONFIRMED as the fictional-data project (guard.mjs). Credentials are never printed.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadAdminEnv } from "./env.mjs";
import { GuardError, assertConfirmedProject, projectRefFromDbUrl } from "./guard.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** Arbitrary constant: one advisory lock per database serialises migration runs. */
export const LOCK_KEY = 7408162026;
export const HISTORY_TABLE = "sparq_migrations.applied";

export class MigrationError extends Error {
  constructor(message, options) { super(message, options); this.name = "MigrationError"; }
}

export const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** Reads `NNNN_name.sql` files in order. The numbers must be contiguous from 0001, as tests/db/migrations.test.ts also asserts. */
export function readMigrationFiles(dir = join(ROOT, "supabase", "migrations")) {
  const names = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  names.forEach((n, i) => {
    if (!n.startsWith(String(i + 1).padStart(4, "0") + "_")) throw new MigrationError(`Migration files must be numbered contiguously from 0001; found "${n}" at position ${i + 1}.`);
  });
  return names.map((name) => { const sql = readFileSync(join(dir, name), "utf8"); return { name, sql, sha: sha256(sql) }; });
}

const HISTORY_SQL = `
create schema if not exists sparq_migrations;
create table if not exists sparq_migrations.applied (
  filename text primary key,
  sha256 text not null,
  applied_at timestamptz not null default now(),
  applied_by text not null
);
alter table sparq_migrations.applied enable row level security;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema sparq_migrations from %I', r);
      execute format('revoke all on all tables in schema sparq_migrations from %I', r);
    end if;
  end loop;
end $$;`;

/**
 * Runs the plan against `db` (an object with `query(sql, params) -> rows[]` and `exec(sql) -> void`; see pgDb / pgliteDb).
 * Returns { applied, pending, ran, seeded }. Throws MigrationError with a clear message and leaves no partial migration behind.
 */
export async function migrate(db, { files, seedSql = null, status = false, dryRun = false, baseline = null, log = () => {}, appliedBy = "sparq-migrate" }) {
  const readOnly = status || dryRun;
  const one = async (sql, params) => (await db.query(sql, params))[0];

  if (!readOnly && !(await one("select pg_try_advisory_lock($1) as ok", [LOCK_KEY])).ok) {
    throw new MigrationError("Another migration run holds the lock on this database. Wait for it to finish and run again.");
  }
  try {
    const hasHistory = (await one("select to_regclass($1) as r", [HISTORY_TABLE])).r !== null;
    const looksInstalled = (await one(`select (to_regclass('public.people') is not null or to_regclass('public.app_users') is not null
      or to_regclass('public.team_proposals') is not null or to_regnamespace('legacy_0001') is not null) as x`)).x;
    let appliedRows = hasHistory ? await db.query("select filename, sha256 from sparq_migrations.applied order by filename") : [];

    if (!hasHistory && looksInstalled && !baseline) {
      throw new MigrationError(
        "This database already contains the Sparq schema but has no migration history, so I cannot know what was applied. I will NOT replay migrations blindly.\n" +
        "If you know the last migration that was applied, adopt the database with --baseline=<that file name> (it is recorded without being executed).");
    }
    if (baseline) {
      if (appliedRows.length > 0) throw new MigrationError("--baseline is only for a database without migration history, and this one already has history.");
      const idx = files.findIndex((f) => f.name === baseline);
      if (idx < 0) throw new MigrationError(`--baseline names "${baseline}", which is not a migration file.`);
    }

    // Verify what is recorded: files must still exist, must not have changed, and must form a prefix of the sequence.
    const byName = new Map(files.map((f) => [f.name, f]));
    for (const r of appliedRows) {
      const f = byName.get(r.filename);
      if (!f) throw new MigrationError(`"${r.filename}" is recorded as applied but is missing from supabase/migrations.`);
      if (f.sha !== r.sha256) {
        throw new MigrationError(`"${r.filename}" was changed after it was applied (recorded ${r.sha256.slice(0, 12)}…, file ${f.sha.slice(0, 12)}…). Never edit an applied migration: restore it and add a new migration instead.`);
      }
    }
    const appliedNames = new Set(appliedRows.map((r) => r.filename));
    const baselineNames = baseline ? files.slice(0, files.findIndex((f) => f.name === baseline) + 1).map((f) => f.name) : [];
    const doneNames = new Set([...appliedNames, ...baselineNames]);
    const pending = files.filter((f) => !doneNames.has(f.name));
    const firstPending = pending[0] ? files.indexOf(pending[0]) : files.length;
    const outOfOrder = files.slice(firstPending).find((f) => doneNames.has(f.name));
    if (outOfOrder) throw new MigrationError(`"${outOfOrder.name}" is recorded as applied but an earlier migration is not. The history is out of order; fix it by hand before running again.`);

    log(`Migrations (${files.length}):`);
    for (const f of files) log(`  ${appliedNames.has(f.name) ? "✓ applied " : baselineNames.includes(f.name) ? "◦ baseline" : "→ pending "}  ${f.name}`);
    if (readOnly) {
      if (dryRun && seedSql) log("Would apply supabase/seed.sql afterwards (idempotent).");
      return { applied: [...appliedNames], pending: pending.map((f) => f.name), ran: [], seeded: false };
    }

    await db.exec(HISTORY_SQL);
    if (baselineNames.length) {
      log(`Baseline: recording ${baselineNames.length} migration(s) as applied WITHOUT executing them (up to ${baseline}).`);
      for (const f of files.filter((x) => baselineNames.includes(x.name))) {
        await db.query("insert into sparq_migrations.applied (filename, sha256, applied_by) values ($1, $2, $3)", [f.name, f.sha, `${appliedBy} (baseline)`]);
      }
    }

    const ran = [];
    for (const f of pending) {
      log(`Applying ${f.name} …`);
      await db.exec("begin");
      try {
        await db.exec(f.sql);
        await db.query("insert into sparq_migrations.applied (filename, sha256, applied_by) values ($1, $2, $3)", [f.name, f.sha, appliedBy]);
        await db.exec("commit");
      } catch (e) {
        try { await db.exec("rollback"); } catch { /* the connection may already have rolled back */ }
        throw new MigrationError(`${f.name} failed and was rolled back (nothing from it was applied; later migrations were not attempted): ${e instanceof Error ? e.message : String(e)}`, { cause: e });
      }
      ran.push(f.name);
    }
    if (pending.length === 0) log("Nothing to apply: the database is up to date.");

    let seeded = false;
    if (seedSql) {
      log("Applying supabase/seed.sql (idempotent) …");
      try {
        await db.exec(seedSql);
        seeded = true;
      } catch (e) {
        try { await db.exec("rollback"); } catch { /* already aborted */ }
        throw new MigrationError(`The seed failed and was rolled back: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
      }
    }
    return { applied: [...appliedNames], pending: [], ran, seeded };
  } finally {
    if (!readOnly) { try { await db.query("select pg_advisory_unlock($1)", [LOCK_KEY]); } catch { /* connection closing */ } }
  }
}

/* ---- adapters ---------------------------------------------------------------------------------------------------------------- */

/** `pg` Client adapter. One connection (advisory locks are per session). */
export function pgDb(client) {
  return { query: async (sql, params) => (await client.query(sql, params)).rows, exec: async (sql) => { await client.query(sql); } };
}
/** PGlite adapter (tests). */
export function pgliteDb(pglite) {
  return { query: async (sql, params) => (await pglite.query(sql, params)).rows, exec: async (sql) => { await pglite.exec(sql); } };
}

/** Resolves and checks the target. Returns the (credential-free) description and the connection settings. */
export function prepareTarget(env) {
  const url = env.SUPABASE_DB_URL;
  if (!url) throw new GuardError("SUPABASE_DB_URL is not set. Put it in .env.admin.local (gitignored) or the environment: it is an ADMIN credential and is never used by the app.");
  const target = projectRefFromDbUrl(url);
  assertConfirmedProject(target, env);
  const u = new URL(url);
  u.searchParams.delete("sslmode"); // pg would otherwise override the ssl option below
  return { target, connectionString: u.toString(), ssl: target.local ? false : { rejectUnauthorized: false } };
}

export function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("--") && !a.includes("=")));
  const baseline = argv.find((a) => a.startsWith("--baseline="))?.slice("--baseline=".length) ?? null;
  const known = new Set(["--status", "--dry-run", "--seed"]);
  const unknown = [...flags].filter((f) => !known.has(f));
  if (unknown.length) throw new MigrationError(`Unknown option(s): ${unknown.join(", ")}`);
  return { status: flags.has("--status"), dryRun: flags.has("--dry-run"), seed: flags.has("--seed"), baseline };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadAdminEnv();
  const { target, connectionString, ssl } = prepareTarget(env);
  console.log(`Target: project "${target.ref}" (${target.host})${target.local ? " [local]" : " [confirmed fictional-data project]"}`);
  const files = readMigrationFiles();
  const seedSql = args.seed ? readFileSync(join(ROOT, "supabase", "seed.sql"), "utf8") : null;
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString, ssl });
  await client.connect();
  try {
    await migrate(pgDb(client), { files, seedSql, status: args.status, dryRun: args.dryRun, baseline: args.baseline, log: (m) => console.log(m), appliedBy: "sparq-migrate" });
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e instanceof MigrationError || e instanceof GuardError ? `\n${e.message}` : `\nUnexpected failure: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
