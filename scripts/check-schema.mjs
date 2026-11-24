// Validates supabase/migrations/*.sql against an in-process Postgres (PGlite) with a stub `auth` schema.
// This checks SQL validity only; it does not emulate Supabase Auth or RLS behaviour end to end.
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
for (const f of readdirSync("supabase/migrations").filter((x) => x.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  console.log("applied", f);
}
const t = await db.query("select count(*)::int n from information_schema.tables where table_schema='public'");
const p = await db.query("select count(*)::int n from pg_policies");
console.log(`OK · ${t.rows[0].n} tables · ${p.rows[0].n} RLS policies`);
