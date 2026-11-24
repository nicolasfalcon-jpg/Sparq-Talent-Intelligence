/**
 * Structural security review, read from the database catalog: RLS everywhere, grants per role (anon and authenticated reviewed
 * separately), column-level protection of sensitive fields, hardened privileged functions, and the ID strategy.
 * These assertions are about the schema, not behaviour; behaviour is tested under real roles in the rls-* files.
 */
import { describe, expect, it } from "vitest";
import { withDb } from "./setup";

const t = withDb();
const rows = (sql: string, params?: unknown[]) => t.db.sql(sql, params);
const API_TABLES = [
  "app_users", "user_roles", "capabilities", "people", "person_preferences", "career_journey_entries", "certifications", "skill_evidence", "project_experience",
  "career_interests", "opportunities", "role_requirements", "opportunity_delivery_leads", "shortlists", "team_proposals", "proposal_seats", "proposal_reviews",
  "assignments", "expressions_of_interest", "audit_log",
];

describe("row-level security", () => {
  it("is enabled on every table of the API schema, with no exception", async () => {
    const r = await rows("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity");
    expect(r).toEqual([]);
    expect((await rows("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'")).map((x) => x.relname).sort()).toEqual([...API_TABLES].sort());
  });
  it("is also on in the archive schema, which has no policy at all (default deny)", async () => {
    expect(await rows("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'legacy_0001' and c.relkind = 'r' and not c.relrowsecurity")).toEqual([]);
    expect(await rows("select count(*)::int n from pg_policies where schemaname = 'legacy_0001'")).toEqual([{ n: 0 }]);
  });
  it("covers the seven tables the original audit found unprotected", async () => {
    for (const tbl of ["app_users", "capabilities", "opportunities", "role_requirements", "assignments", "certifications"]) {
      expect((await rows("select relrowsecurity from pg_class where oid = ('public.' || $1)::regclass", [tbl]))[0]!.relrowsecurity, tbl).toBe(true);
    }
    // `availability` (the seventh) no longer exists as a stored table: it is derived (0007).
    expect(await rows("select to_regclass('public.availability') as r")).toEqual([{ r: null }]);
  });
  it("every table has at least one policy, and tables written only by privileged functions have SELECT policies only", async () => {
    for (const tbl of API_TABLES) expect((await rows("select count(*)::int n from pg_policies where schemaname = 'public' and tablename = $1", [tbl]))[0]!.n, tbl).toBeGreaterThan(0);
    for (const tbl of ["user_roles", "opportunity_delivery_leads", "proposal_reviews", "assignments", "audit_log"]) {
      expect((await rows("select distinct cmd from pg_policies where schemaname = 'public' and tablename = $1", [tbl])), tbl).toEqual([{ cmd: "SELECT" }]);
    }
  });
  it("every policy is restricted to `authenticated` (none applies to anon or PUBLIC)", async () => {
    const r = await rows("select policyname, roles from pg_policies where schemaname = 'public' and roles <> '{authenticated}'");
    expect(r).toEqual([]);
  });
});

describe("grants: anon", () => {
  it("has no privilege of any kind on any table, column, sequence or function, and cannot use the private or archive schemas", async () => {
    const tbl = await rows(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'private', 'legacy_0001') and c.relkind in ('r', 'v', 'S')
      and (has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger') or has_any_column_privilege('anon', c.oid, 'select, insert, update, references'))`);
    expect(tbl).toEqual([]);
    const fn = await rows(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')`);
    expect(fn).toEqual([]);
    for (const s of ["private", "legacy_0001"]) expect((await rows("select has_schema_privilege('anon', $1, 'usage') u", [s]))[0]!.u, s).toBe(false);
  });
});

describe("grants: service_role is not a workaround", () => {
  it("has no privilege on application tables or functions (the app never uses it; a missing policy must be fixed, not bypassed)", async () => {
    const tbl = await rows(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'legacy_0001') and c.relkind = 'r'
      and has_any_column_privilege('service_role', c.oid, 'select, insert, update, references')`);
    expect(tbl).toEqual([]);
    const fn = await rows(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private') and has_function_privilege('service_role', p.oid, 'execute')`);
    expect(fn).toEqual([]);
  });
});

describe("grants: authenticated", () => {
  it("never has TRUNCATE, REFERENCES or TRIGGER on anything", async () => {
    const r = await rows(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege('authenticated', c.oid, 'truncate, references, trigger')`);
    expect(r).toEqual([]);
  });
  it("cannot write at all to tables that only privileged functions change (no table-level or column-level INSERT/UPDATE/DELETE)", async () => {
    for (const tbl of ["user_roles", "opportunity_delivery_leads", "proposal_reviews", "assignments", "audit_log"]) {
      const r = await rows(`select has_table_privilege('authenticated', $1::regclass, 'insert, update, delete') t, has_any_column_privilege('authenticated', $1::regclass, 'insert, update') c`, [`public.${tbl}`]);
      expect(r, tbl).toEqual([{ t: false, c: false }]);
    }
  });
  const writable = async (tbl: string, col: string, priv: "update" | "insert" | "select") =>
    (await rows("select has_column_privilege('authenticated', $1::regclass, $2, $3) ok", [`public.${tbl}`, col, priv]))[0]!.ok as boolean;

  it("cannot write verification metadata, on insert or update, on skills or experience", async () => {
    for (const tbl of ["skill_evidence", "project_experience"]) {
      for (const col of ["verification", "verified_by", "verified_at", "verification_note"]) {
        expect(await writable(tbl, col, "update"), `${tbl}.${col} update`).toBe(false);
        expect(await writable(tbl, col, "insert"), `${tbl}.${col} insert`).toBe(false);
      }
      expect(await writable(tbl, "person_id", "update"), `${tbl}.person_id update (cannot move evidence to someone else)`).toBe(false);
    }
  });
  it("cannot edit proposal state, version or submission stamps, nor reassign authorship", async () => {
    for (const col of ["state", "version", "submitted_by", "submitted_at", "created_by", "id"]) {
      expect(await writable("team_proposals", col, "update"), `update ${col}`).toBe(false);
      expect(await writable("team_proposals", col, "insert"), `insert ${col}`).toBe(false);
    }
  });
  it("cannot change identity or privilege columns, and cannot even read the identity-to-profile link", async () => {
    for (const col of ["id", "person_id", "created_at"]) expect(await writable("app_users", col, "update"), `app_users.${col}`).toBe(false);
    expect(await writable("app_users", "display_name", "update")).toBe(true);
    expect(await writable("app_users", "person_id", "select")).toBe(false);
    expect(await writable("user_roles", "granted_by", "select")).toBe(false);
  });
  it("owners cannot edit HR facts of their own profile (only how they describe themselves)", async () => {
    for (const col of ["name", "discipline", "years_experience", "location", "at_sparq_since", "slug", "id"]) expect(await writable("people", col, "update"), col).toBe(false);
    for (const col of ["summary", "headline", "languages", "top_skills", "passport_groups"]) expect(await writable("people", col, "update"), col).toBe(true);
  });
  it("cannot edit an expression of interest's owner or target, nor its withdrawal stamp", async () => {
    for (const col of ["person_id", "role_requirement_id", "withdrawn_at", "created_at"]) expect(await writable("expressions_of_interest", col, "update"), col).toBe(false);
  });
});

describe("privileged functions are hardened", () => {
  it("no function in `public` or `private` is executable by PUBLIC (no default grant survived)", async () => {
    const r = await rows(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private')
      and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))`);
    expect(r).toEqual([]);
  });
  it("every SECURITY DEFINER function pins an empty search_path", async () => {
    const r = await rows(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private') and p.prosecdef
      and not coalesce(p.proconfig @> array['search_path='], false) and not coalesce(p.proconfig @> array['search_path=""'], false)`);
    expect(r).toEqual([]);
  });
  it("every function in the schema pins an empty search_path, definer or not", async () => {
    const r = await rows(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private')
      and p.prokind = 'f' and not coalesce(p.proconfig @> array['search_path=""'], false) and not coalesce(p.proconfig @> array['search_path='], false)`);
    expect(r).toEqual([]);
  });
  it("the RPC surface is exactly the reviewed list, and only `authenticated` can execute it", async () => {
    const r = await rows(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') order by 1`);
    expect(r.map((x) => x.proname)).toEqual([
      "assign_delivery_lead", "confirm_assignment", "decide_evidence_verification", "grant_user_role", "link_user_profile", "my_identity", "person_availability",
      "record_profile_export", "request_evidence_verification", "review_proposal", "revoke_user_role", "submit_proposal", "withdraw_proposal",
    ]);
  });
  it("no privileged function accepts an actor argument: the actor is always auth.uid()", async () => {
    const r = await rows(`select p.proname, pg_get_function_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef`);
    for (const f of r) expect(f.args, f.proname).not.toMatch(/\b(actor|user_id|as_user|acting)\b/i);
  });
  it("the audit writer and the actor check are not callable by any API role", async () => {
    for (const fn of ["private.write_audit(uuid, text, text, uuid, uuid, jsonb)", "private.require_actor()"]) {
      expect((await rows("select has_function_privilege('authenticated', $1::regprocedure, 'execute') x", [fn]))[0]!.x, fn).toBe(false);
    }
  });
  it("trigger functions are not executable by API roles (they fire without it)", async () => {
    const r = await rows(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.prorettype = 'trigger'::regtype and has_function_privilege('authenticated', p.oid, 'execute')`);
    expect(r).toEqual([]);
  });
});

describe("new tables are closed by default", () => {
  it("a table created later by the migration owner gets NO grant for anon, authenticated or service_role", async () => {
    await t.db.exec("create table public.zz_future_table (id uuid primary key)");
    const r = await rows(`select r from unnest(array['anon', 'authenticated', 'service_role']) r where has_table_privilege(r, 'public.zz_future_table', 'select, insert, update, delete')`);
    expect(r).toEqual([]);
  });
});

describe("ID strategy", () => {
  it("every entity table has a uuid primary key; join tables use their natural composite keys", async () => {
    const entities = API_TABLES.filter((x) => !["person_preferences", "career_interests", "opportunity_delivery_leads", "shortlists", "user_roles", "audit_log", "app_users"].includes(x));
    for (const tbl of entities) {
      const r = await rows(`select a.attname, format_type(a.atttypid, a.atttypmod) typ from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = $1::regclass and i.indisprimary`, [`public.${tbl}`]);
      expect(r, tbl).toEqual([{ attname: "id", typ: "uuid" }]);
    }
    expect((await rows(`select format_type(atttypid, atttypmod) t from pg_attribute where attrelid = 'public.app_users'::regclass and attname = 'id'`))[0]!.t).toBe("uuid");
    expect((await rows(`select format_type(atttypid, atttypmod) t from pg_attribute where attrelid = 'public.audit_log'::regclass and attname = 'id'`))[0]!.t).toBe("bigint"); // an append-only log, not an entity
  });
  it("people, capabilities, opportunities and role requirements also carry a unique, well-formed slug", async () => {
    for (const tbl of ["people", "capabilities", "opportunities", "role_requirements"]) {
      const r = await rows(`select count(*)::int n from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = $1::regclass and i.indisunique and a.attname = 'slug'`, [`public.${tbl}`]);
      expect(r[0]!.n, tbl).toBe(1);
    }
    expect((await t.db.attempt(() => t.db.exec("insert into public.people (slug, name, discipline, location, years_experience) values ('Not A Slug', 'x', 'Mobile', 'x', 1)"))).ok).toBe(false);
  });
  it("every foreign key to an identity or profile points at a uuid column (no text key survives)", async () => {
    const r = await rows(`select c.conrelid::regclass::text tbl, a.attname from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace and format_type(a.atttypid, a.atttypmod) = 'text'`);
    expect(r).toEqual([]);
  });
});

describe("enums and the evidence model", () => {
  it("source and verification are separate enums with the approved values", async () => {
    const vals = async (e: string) => (await rows("select unnest(enum_range(null::public." + e + "))::text v")).map((x) => x.v);
    expect(await vals("verification_status")).toEqual(["self_reported", "pending", "verified"]);
    expect(await vals("evidence_level")).toEqual(["professional", "independent", "training", "emerging"]);
    expect(await vals("proposal_state")).toEqual(["draft", "submitted", "changes_requested", "approved", "declined", "withdrawn"]);
    expect(await vals("seat_state")).toEqual(["open", "proposed"]); // there is NO 'confirmed' seat: confirmed is an assignment
    expect(await vals("app_role")).toEqual(["staffing_lead", "engineer", "delivery_lead", "admin"]);
  });
  it("there is no 0001-style redundant representation left on the new tables", async () => {
    const cols = async (tbl: string) => (await rows("select attname from pg_attribute where attrelid = $1::regclass and attnum > 0 and not attisdropped", [`public.${tbl}`])).map((x) => x.attname);
    expect(await cols("skill_evidence")).not.toContain("self_reported");
    expect(await cols("project_experience")).not.toContain("source");
    expect(await cols("role_requirements")).not.toContain("proposed_person_id");
    expect(await cols("people")).not.toContain("work_preferences"); // lives in person_preferences, where it can be disclosed as a unit
    expect(await cols("opportunities")).not.toContain("delivery_lead"); // a relation now (opportunity_delivery_leads), not free text
  });
});
