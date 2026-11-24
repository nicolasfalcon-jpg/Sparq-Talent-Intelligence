/**
 * Privilege escalation attempts. Roles, role assignments, identity links and reviewer assignments can be changed only by an administrator,
 * through audited functions, never for themselves; an administrator has no business powers; forged tokens grant nothing.
 */
import { describe, expect, it } from "vitest";
import { U, seedId } from "@/data/seed/ids";
import { denied, seen, tryAs, withDb } from "./setup";

const t = withDb();
const P = (slug: string) => seedId("person", slug);
const roles = async (user: string) => (await t.db.sql("select role::text r from user_roles where user_id = $1 order by 1", [user])).map((r) => r.r);
const rpc = (who: string, call: string, params?: unknown[]) => tryAs(t.db, who, `select public.${call}`, params);

describe("nobody can edit roles, identity links or reviewer assignments directly", () => {
  it("no API role can insert, update or delete user_roles", async () => {
    for (const who of [U.ana, U.laura, U.rafael, U.admin]) {
      for (const sql of [`insert into user_roles (user_id, role) values ('${U.ana}', 'admin')`, `update user_roles set role = 'admin' where user_id = '${who}'`, "delete from user_roles"]) {
        expect(denied(await tryAs(t.db, who, sql)), `${who}: ${sql}`).toMatch(/permission denied/);
      }
    }
    expect(await roles(U.ana)).toEqual(["engineer"]);
  });
  it("DEFENSE IN DEPTH: even if a grant were added by mistake, the privileged-table trigger refuses", async () => {
    await t.db.exec("grant insert, update, delete on user_roles, opportunity_delivery_leads, assignments to authenticated");
    await t.db.exec("alter table user_roles disable row level security; alter table opportunity_delivery_leads disable row level security; alter table assignments disable row level security");
    expect(denied(await tryAs(t.db, U.ana, `insert into user_roles (user_id, role) values ('${U.ana}', 'admin')`))).toMatch(/append-only|not allowed/);
    expect(denied(await tryAs(t.db, U.ana, `insert into opportunity_delivery_leads (opportunity_id, user_id) values ('${seedId("opportunity", "vela")}', '${U.ana}')`))).toMatch(/not allowed/);
    expect(denied(await tryAs(t.db, U.ana, `insert into assignments (person_id, project_name, starts_on, delivery_lead_id, confirmed_by) values ('${P("ana")}', 'x', '2030-01-01', '${U.ana}', '${U.ana}')`))).toMatch(/not allowed/);
    expect(await roles(U.ana)).toEqual(["engineer"]);
  });
  it("users cannot change their identity link, their id or their creation time; they can change their own display name and title", async () => {
    for (const set of [`person_id = '${P("lucia")}'`, "person_id = null", `id = '${U.laura}'`, "created_at = now()"]) {
      expect(denied(await tryAs(t.db, U.ana, `update app_users set ${set} where id = '${U.ana}'`)), set).toMatch(/permission denied/);
    }
    expect((await seen(t.db, U.ana, "update app_users set display_name = 'Ana R.' where id = $1 returning display_name", [U.ana]))[0]!.display_name).toBe("Ana R.");
    expect((await seen(t.db, U.ana, "update app_users set display_name = 'Pwned' where id = $1 returning id", [U.laura])).length).toBe(0); // someone else's row
    expect((await t.db.sql("select display_name from app_users where id = $1", [U.laura]))[0]!.display_name).toBe("Laura Gómez");
  });
  it("DEFENSE IN DEPTH: with the column grants widened, the identity trigger still refuses a change of the profile link", async () => {
    await t.db.exec("grant update on app_users to authenticated");
    expect(denied(await tryAs(t.db, U.ana, `update app_users set person_id = '${P("lucia")}' where id = '${U.ana}'`))).toMatch(/identity fields cannot be changed through the API/);
  });
  it("nobody can create or delete identities through the API", async () => {
    expect(denied(await tryAs(t.db, U.admin, "insert into app_users (id, display_name) values (gen_random_uuid(), 'x')"))).toMatch(/permission denied/);
    expect(denied(await tryAs(t.db, U.admin, "delete from app_users"))).toMatch(/permission denied/);
  });
  it("only an administrator edits reference data", async () => {
    expect(denied(await tryAs(t.db, U.laura, "insert into capabilities (slug, name, grp) values ('rust', 'Rust', 'web')"))).toMatch(/row-level security/);
    expect((await tryAs(t.db, U.admin, "insert into capabilities (slug, name, grp) values ('rust', 'Rust', 'web') returning id")).ok).toBe(true);
    expect((await seen(t.db, U.laura, "update capabilities set name = 'X' where slug = 'aws' returning id")).length).toBe(0);
  });
});

describe("administrators manage roles through audited functions, never their own", () => {
  it("a non-administrator cannot grant or revoke anything, or link or assign", async () => {
    for (const who of [U.ana, U.laura, U.rafael, U.camila]) {
      expect(denied(await rpc(who, "grant_user_role($1, 'admin')", [U.ana])), who).toMatch(/administrators only/);
      expect(denied(await rpc(who, "revoke_user_role($1, 'engineer')", [U.ana])), who).toMatch(/administrators only/);
      expect(denied(await rpc(who, "link_user_profile($1, $2)", [U.ana, P("lucia")])), who).toMatch(/administrators only/);
      expect(denied(await rpc(who, "assign_delivery_lead($1, $2, true)", [seedId("opportunity", "cobalt"), U.camila])), who).toMatch(/administrators only/);
    }
    expect(await roles(U.ana)).toEqual(["engineer"]);
  });
  it("an administrator cannot change their OWN roles, link their own profile, or make themselves a reviewer", async () => {
    expect(denied(await rpc(U.admin, "grant_user_role($1, 'delivery_lead')", [U.admin]))).toMatch(/cannot change their own roles/);
    expect(denied(await rpc(U.admin, "grant_user_role($1, 'staffing_lead')", [U.admin]))).toMatch(/cannot change their own roles/);
    expect(denied(await rpc(U.admin, "revoke_user_role($1, 'admin')", [U.admin]))).toMatch(/cannot change their own roles/);
    expect(denied(await rpc(U.admin, "link_user_profile($1, $2)", [U.admin, P("ana")]))).toMatch(/cannot link their own profile/);
    expect(denied(await rpc(U.admin, "assign_delivery_lead($1, $2, true)", [seedId("opportunity", "cobalt"), U.admin]))).toMatch(/cannot assign themselves/);
    expect(await roles(U.admin)).toEqual(["admin"]);
  });
  it("an administrator can grant and revoke roles for OTHERS; each change is audited with actor and subject", async () => {
    expect((await rpc(U.admin, "grant_user_role($1, 'staffing_lead')", [U.lucia])).ok).toBe(true);
    expect(await roles(U.lucia)).toEqual(["engineer", "staffing_lead"]);
    expect((await rpc(U.admin, "revoke_user_role($1, 'staffing_lead')", [U.lucia])).ok).toBe(true);
    expect(await roles(U.lucia)).toEqual(["engineer"]);
    const log = await t.db.sql("select action, actor_id::text a, subject_id::text s, details ->> 'role' r from audit_log where subject_id = $1 and details ->> 'seeded' is null order by id", [U.lucia]);
    expect(log).toEqual([{ action: "permission.grant", a: U.admin, s: U.lucia, r: "staffing_lead" }, { action: "permission.revoke", a: U.admin, s: U.lucia, r: "staffing_lead" }]);
  });
  it("granting a role someone already has changes nothing and writes nothing", async () => {
    const before = (await t.db.sql("select count(*)::int n from audit_log"))[0]!.n;
    expect((await rpc(U.admin, "grant_user_role($1, 'engineer')", [U.ana])).ok).toBe(true);
    expect((await t.db.sql("select count(*)::int n from audit_log"))[0]!.n).toBe(before);
  });
  it("a new reviewer assignment needs the delivery-lead role, and revoking the role drops their reviewer assignments", async () => {
    const cobalt = seedId("opportunity", "cobalt");
    expect(denied(await rpc(U.admin, "assign_delivery_lead($1, $2, true)", [cobalt, U.ana]))).toMatch(/not a delivery lead/);
    expect((await rpc(U.admin, "assign_delivery_lead($1, $2, true)", [cobalt, U.camila])).ok).toBe(true);
    expect((await seen(t.db, U.camila, "select slug from opportunities")).map((r) => r.slug)).toEqual(["cobalt"]);
    expect((await rpc(U.admin, "revoke_user_role($1, 'delivery_lead')", [U.camila])).ok).toBe(true);
    expect((await t.db.sql("select count(*)::int n from opportunity_delivery_leads where user_id = $1", [U.camila]))[0]!.n).toBe(0);
    expect((await seen(t.db, U.camila, "select slug from opportunities")).length).toBe(0);
  });
  it("linking a user to a profile is audited, refuses a profile that is already someone's, and can be undone", async () => {
    expect(denied(await rpc(U.admin, "link_user_profile($1, $2)", [U.lucia, P("ana")]))).toMatch(/duplicate key|unique/);
    expect((await rpc(U.admin, "link_user_profile($1, null)", [U.lucia])).ok).toBe(true);
    expect((await seen(t.db, U.lucia, "select count(*)::int n from people"))[0]!.n).toBe(0); // no profile, no access to any
    expect((await rpc(U.admin, "link_user_profile($1, $2)", [U.lucia, P("lucia")])).ok).toBe(true);
    expect((await t.db.sql("select count(*)::int n from audit_log where action = 'permission.link_profile'"))[0]!.n).toBe(2);
  });
  it("granting someone a role does not, by itself, give them powers over other people's work", async () => {
    await rpc(U.admin, "grant_user_role($1, 'delivery_lead')", [U.laura]); // Laura is now a delivery lead as well
    expect(denied(await tryAs(t.db, U.laura, "select public.review_proposal($1, 'approved', null)", [seedId("proposal", "vela")]))).toMatch(/only the delivery lead assigned to this opportunity/);
    expect(denied(await decideFor(U.laura, E("ana-ev-5")))).toMatch(/not an authorized reviewer/);
  });
});

const E = (id: string) => seedId("evidence", id);
const decideFor = (who: string, id: string) => tryAs(t.db, who, "select public.decide_evidence_verification('skill', $1, 'verify', null)", [id]);

describe("an administrator has no business powers", () => {
  it("cannot verify, review, confirm, submit or withdraw anything", async () => {
    expect(denied(await decideFor(U.admin, E("ana-ev-5")))).toMatch(/not an authorized reviewer/);
    expect(denied(await tryAs(t.db, U.admin, "select public.review_proposal($1, 'approved', null)", [seedId("proposal", "vela")]))).toMatch(/only the delivery lead assigned/);
    expect(denied(await tryAs(t.db, U.admin, "select public.confirm_assignment($1, '2027-01-12')", [seedId("seat", "vela-ai")]))).toMatch(/only the delivery lead assigned/);
    expect(denied(await tryAs(t.db, U.admin, "select public.submit_proposal($1)", [seedId("proposal", "vela")]))).toMatch(/only the staffing lead who wrote/);
    expect(denied(await tryAs(t.db, U.admin, "select public.withdraw_proposal($1)", [seedId("proposal", "vela")]))).toMatch(/only the author/);
    expect(denied(await tryAs(t.db, U.admin, "select public.record_profile_export($1, 'pdf', false)", [P("ana")]))).toMatch(/cannot export/);
  });
});

describe("a forged or odd token grants nothing", () => {
  it("JWT claims that say 'admin' (role, app_metadata, user_metadata) are ignored: roles come from user_roles", async () => {
    const claims = { app_metadata: { role: "admin", roles: ["admin"] }, user_metadata: { role: "admin", is_admin: true }, user_role: "admin" };
    const grant = await t.db.attempt(() => t.db.as(U.ana, (q) => q("select public.grant_user_role($1, 'admin')", [U.ana]), claims));
    expect(denied(grant)).toMatch(/administrators only/);
    const seenAudit = await t.db.as(U.ana, (q) => q("select count(*)::int n from audit_log where action like 'permission.%'"), claims);
    expect(seenAudit[0]!.n).toBe(0); // forged claims do not unlock the administrator's view of the audit log either
    expect(await roles(U.ana)).toEqual(["engineer"]);
  });
  it("claiming the service_role in the token does not make an authenticated session privileged", async () => {
    const r = await t.db.attempt(() => t.db.as(U.ana, (q) => q("select count(*)::int n from user_roles where user_id <> $1", [U.ana]), { role: "service_role" }));
    expect(r.ok && r.value[0]!.n).toBe(0);
  });
  it("service_role itself has no privilege on application tables or functions", async () => {
    for (const sql of ["select * from user_roles", "select * from people", "delete from audit_log", "select public.grant_user_role(gen_random_uuid(), 'admin')"]) {
      expect(denied(await tryAs(t.db, "service_role", sql)), sql).toMatch(/permission denied/);
    }
  });
  it("a token whose subject is not a user of the system can do nothing", async () => {
    const ghost = "00000000-0000-4000-8000-00000000dead";
    expect(denied(await tryAs(t.db, ghost, "select public.grant_user_role($1, 'admin')", [ghost]))).toMatch(/administrators only/);
    expect((await seen(t.db, ghost, "select public.my_identity() i"))[0]!.i).toBeNull();
  });
});

describe("authorization predicates are total: they never return NULL (a NULL silently skips a denial check)", () => {
  it("every boolean helper returns true or false for every kind of caller and argument", async () => {
    const helpers = (await t.db.sql(`select p.proname, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and p.prorettype = 'boolean'::regtype and has_function_privilege('authenticated', p.oid, 'execute') order by 1`));
    expect(helpers.map((h) => h.proname)).toEqual([
      "can_edit_proposal", "can_read_profile", "can_see_opportunity", "can_see_proposal", "has_role", "is_admin", "is_reviewer_for_person",
      "leads_opportunity", "owns_opportunity", "owns_person", "role_open_for_interest",
    ]);
    const callers = [U.ana, U.lucia, U.laura, U.rafael, U.camila, U.admin, "00000000-0000-4000-8000-00000000dead"];
    const uuidArgs = [null, "00000000-0000-4000-8000-000000000001", P("ana"), seedId("opportunity", "vela"), seedId("proposal", "vela"), seedId("role", "vela-mobile")];
    for (const h of helpers) {
      const shape = h.args === "" ? "none" : /app_role/.test(h.args) ? "role" : "uuid";
      for (const who of callers) {
        for (const arg of shape === "uuid" ? uuidArgs : [null]) {
          const call = shape === "none" ? `private.${h.proname}()` : shape === "role" ? `private.${h.proname}('engineer')` : `private.${h.proname}($1::uuid)`;
          const r = await seen(t.db, who, `select ${call} v`, shape === "uuid" ? [arg] : []);
          expect(typeof r[0]!.v, `${h.proname}(${arg}) as ${who}`).toBe("boolean");
        }
      }
    }
  });
  it("the regression itself: a user with no profile is not treated as the owner of anyone's evidence", async () => {
    for (const who of [U.laura, U.rafael, U.admin]) {
      expect(denied(await tryAs(t.db, who, "select public.request_evidence_verification('skill', $1, true)", [E("ana-ev-5")])), who).toMatch(/only the owner/);
    }
    expect((await t.db.sql("select verification::text v from skill_evidence where id = $1", [E("ana-ev-5")]))[0]!.v).toBe("self_reported");
  });
});

describe("profile exports are audited, and the owner can see who exported theirs", () => {
  const exp = (who: string, person: string, fmt = "pdf") => tryAs(t.db, who, "select public.record_profile_export($1, $2, true)", [person, fmt]);
  it("a staffing lead's export of Ana's passport is recorded with actor, profile, format and anonymization", async () => {
    expect((await exp(U.laura, P("ana"))).ok).toBe(true);
    const [row] = await t.db.sql("select actor_id::text a, subject_person_id::text p, details from audit_log where action = 'profile.export'");
    expect(row).toMatchObject({ a: U.laura, p: P("ana") });
    expect(row!.details).toMatchObject({ format: "pdf", anonymized: true, by_owner: false });
  });
  it("the owner reads the record of exports of their own profile; other engineers and unrelated people do not", async () => {
    await exp(U.laura, P("ana"));
    expect((await seen(t.db, U.ana, "select count(*)::int n from audit_log where action = 'profile.export'"))[0]!.n).toBe(1);
    for (const who of [U.lucia, U.ines, U.camila]) expect((await seen(t.db, who, "select count(*)::int n from audit_log where action = 'profile.export'"))[0]!.n, who).toBe(0);
  });
  it("owners can export their own; engineers cannot export someone else's; formats are validated", async () => {
    expect((await exp(U.ana, P("ana"), "docx")).ok).toBe(true);
    expect(denied(await exp(U.lucia, P("ana")))).toMatch(/cannot export this profile/);
    expect(denied(await exp(U.laura, P("ana"), "exe"))).toMatch(/unknown export format/);
    expect(denied(await exp(U.laura, "00000000-0000-4000-8000-000000000001"))).toMatch(/profile not found/);
  });
  it("an export can never be written, altered or hidden by the person who made it", async () => {
    await exp(U.laura, P("ana"));
    expect(denied(await tryAs(t.db, U.laura, "delete from audit_log where action = 'profile.export'"))).toMatch(/permission denied/);
  });
});
