// `npm run db:check`: applies every migration and the seed, in order, to a DISPOSABLE in-process PostgreSQL (PGlite) that emulates the
// Supabase roles and `auth` schema (tests/db/bootstrap.sql), then prints a structural summary. Nothing leaves the machine.
//
// This is a fast sanity check of SQL validity and of what the schema contains. It is NOT the authorization evidence: the behaviour of
// RLS, grants, triggers and the privileged functions under real roles is tested by `npm run db:test` (tests/db/*).
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { demoAuthUsersSql } from "./db/seed-users.mjs";

const db = new PGlite();
await db.exec(readFileSync("tests/db/bootstrap.sql", "utf8"));
for (const f of readdirSync("supabase/migrations").filter((x) => x.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  console.log("applied", f);
}
await db.exec(demoAuthUsersSql()); // stands in for provisioning (Supabase Auth) in this disposable database only
await db.exec(readFileSync("supabase/seed.sql", "utf8"));
console.log("applied seed.sql");

const one = async (sql) => (await db.query(sql)).rows[0];
const tables = await one("select count(*)::int n from pg_tables where schemaname = 'public'");
const noRls = await one("select count(*)::int n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity");
const policies = await one("select count(*)::int n from pg_policies where schemaname = 'public'");
const rpc = await one("select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')");
const anon = await one("select count(*)::int n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and has_any_column_privilege('anon', c.oid, 'select, insert, update')");
const people = await one("select count(*)::int n from public.people");
console.log(`OK · ${tables.n} tables · ${noRls.n} without RLS · ${policies.n} policies · ${rpc.n} RPC functions · ${anon.n} tables reachable by anon · ${people.n} seeded profiles`);
if (noRls.n !== 0 || anon.n !== 0) { console.error("FAILED: a table has no RLS or is reachable by anon"); process.exit(1); }
