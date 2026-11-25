/**
 * REMOTE security verification with REAL authenticated tokens: GoTrue issues the tokens, PostgREST enforces the schema's grants and
 * row-level security over HTTP, each request is independent. Targets only the dedicated FICTIONAL-data Supabase project, only when
 * SPARQ_CONFIRM_FICTIONAL_PROJECT matches its ref (see tests/remote/client.ts remoteStatus).
 *
 * STATUS: written to run against a real project; NOT yet executed against one (no project existed when this was written).
 * Passing these tests would show the reviewed behaviour on that project; it would NOT make the system production-ready.
 *
 * Seed accounts (one role each): laura staffing lead; ana, lucia, camila engineers; rafael (Vela, Terra) and ines (Cobalt, Nimbus)
 * delivery leads; admin administrator. Mutating checks restore what they change.
 */
import { afterAll, describe, expect, it } from "vitest";
import { U, seedId } from "@/data/seed/ids";
import { announce, forgeToken, message, refused, remoteStatus, rows, tamperToken } from "./client";
import { remoteSession } from "./session";

const status = remoteStatus();
announce("security", status);

const P = (slug: string) => seedId("person", slug);
const E = (id: string) => seedId("evidence", id);

if (status.state === "refuse") {
  describe("remote security", () => { it("refuses to run", () => { throw new Error(status.reason); }); });
} else {
  describe.skipIf(status.state === "skip")("remote security (real tokens, over HTTP)", () => {
    const { api, token } = remoteSession(status as Extract<typeof status, { state: "ready" }>);
    const slugs = async (who: Parameters<typeof token>[0], path: string, col = "slug") => rows(await api.get(await token(who), `${path}`)).map((r) => r[col] as string).sort();

    describe("anonymous access is denied", () => {
      const TABLES = ["app_users", "user_roles", "capabilities", "people", "person_preferences", "career_journey_entries", "certifications", "skill_evidence", "project_experience", "career_interests",
        "opportunities", "role_requirements", "opportunity_delivery_leads", "shortlists", "team_proposals", "proposal_seats", "proposal_reviews", "assignments", "expressions_of_interest", "audit_log", "assistant_usage"];
      it.each(TABLES)("the anon key alone cannot read %s", async (table) => {
        const r = await api.get(null, `${table}?limit=1`);
        expect(refused(r), `${table} → ${r.status}`).toBe(true);
        expect(rows(r)).toEqual([]);
      });
      it("cannot write anything", async () => {
        for (const [method, path] of [["POST", "capabilities"], ["PATCH", "people?slug=eq.ana"], ["DELETE", "skill_evidence?label=eq.x"]] as const) {
          expect(refused(await api.rest(null, method, path, method === "DELETE" ? undefined : { slug: "x", name: "x", grp: "web", summary: "x" })), `${method} ${path}`).toBe(true);
        }
      });
      it("cannot call a single function", async () => {
        for (const [fn, args] of [["my_identity", {}], ["person_availability", {}], ["consume_assistant_quota", { p_limit: 5 }], ["grant_user_role", { p_user: U.ana, p_role: "admin" }], ["review_proposal", { p_id: U.ana, p_decision: "approved", p_note: null }]] as const) {
          expect(refused(await api.rpc(null, fn, args)), fn).toBe(true);
        }
      });
      it("exposes no table through the OpenAPI document", async () => {
        const r = await api.get(null, "");
        if (r.status === 200 && r.json?.paths) expect(Object.keys(r.json.paths).filter((p) => p !== "/")).toEqual([]);
        else expect(refused(r) || r.status === 200).toBe(true);
      });
    });

    describe("forged and tampered tokens carry no authority (the signature is what counts)", () => {
      const asLaura = { sub: U.laura, email: "laura@sparq-demo.example" };
      it("a token signed with a secret the project does not know is rejected, whatever role or claims it carries", async () => {
        for (const claims of [asLaura, { ...asLaura, role: "service_role" }, { ...asLaura, app_metadata: { role: "admin" }, user_metadata: { role: "admin" } }]) {
          const r = await api.get(forgeToken(claims), "people?limit=1");
          expect(r.status, JSON.stringify(claims)).toBe(401);
          expect(rows(r)).toEqual([]);
        }
        expect((await api.rpc(forgeToken(asLaura), "my_identity")).status).toBe(401);
      });
      it("a genuine token whose payload was edited afterwards is rejected", async () => {
        const ana = await token("ana");
        expect((await api.get(tamperToken(ana, { sub: U.laura }), "people?limit=1")).status).toBe(401);
        expect((await api.get(tamperToken(ana, { role: "service_role" }), "people?limit=1")).status).toBe(401);
        expect((await api.get(tamperToken(ana, { app_metadata: { role: "admin" } }), "people?limit=1")).status).toBe(401);
      });
      it("the role in a genuine token is not an application role: an engineer's token reads as an engineer", async () => {
        const me = (await api.rpc(await token("ana"), "my_identity")).json;
        expect(me.roles).toEqual(["engineer"]);
      });
    });

    describe("cross-role permissions (the access matrix of docs/handoff/08 §7, sampled)", () => {
      it("a staffing lead reads every profile, opportunity and reviewer assignment, and the shared slice of private data only", async () => {
        expect(await slugs("laura", "people?select=slug")).toHaveLength(12);
        expect(await slugs("laura", "opportunities?select=slug")).toEqual(["cobalt", "nimbus", "terra", "vela"]);
        expect(rows(await api.get(await token("laura"), "opportunity_delivery_leads?select=user_id"))).toHaveLength(4);
        expect(rows(await api.get(await token("laura"), "skill_evidence?select=id&limit=1000")).length).toBeGreaterThan(60);
      });
      it("an engineer reads only her own profile, her own evidence, the published opportunities and nothing about reviewers or proposals", async () => {
        const t = await token("ana");
        expect(await slugs("ana", "people?select=slug")).toEqual(["ana"]);
        expect(new Set(rows(await api.get(t, "skill_evidence?select=person_id&limit=1000")).map((r) => r.person_id))).toEqual(new Set([P("ana")]));
        expect(await slugs("ana", "opportunities?select=slug")).toEqual(["cobalt", "terra", "vela"]); // Open + the one she shared interest in; never Nimbus (Upcoming)
        for (const table of ["opportunity_delivery_leads", "team_proposals", "proposal_seats", "proposal_reviews", "shortlists"]) expect(rows(await api.get(t, `${table}?select=*`)), table).toEqual([]);
        expect(rows(await api.get(t, "assignments?select=person_id")).every((r) => r.person_id === P("ana"))).toBe(true);
      });
      it("a delivery lead reads only the opportunities she leads and the people she works with", async () => {
        expect(await slugs("rafael", "opportunities?select=slug")).toEqual(["terra", "vela"]);
        expect(await slugs("ines", "opportunities?select=slug")).toEqual(["cobalt", "nimbus"]);
        const rafaels = await slugs("rafael", "people?select=slug");
        expect(rafaels).toEqual(expect.arrayContaining(["ana", "javier", "sofia"]));
        expect(rafaels).not.toContain("daniel"); // Daniel is Ines's
        expect(await slugs("ines", "people?select=slug")).not.toContain("ana");
        for (const table of ["career_interests", "person_preferences", "shortlists"]) expect(rows(await api.get(await token("rafael"), `${table}?select=*`)), table).toEqual([]);
      });
      it("an administrator reads identity, roles, reviewers and the audit log, and no staffing data", async () => {
        const t = await token("admin");
        expect(await slugs("admin", "people?select=slug")).toHaveLength(12);
        expect(rows(await api.get(t, "user_roles?select=user_id,role"))).toHaveLength(7);
        expect(rows(await api.get(t, "audit_log?select=id&limit=1000")).length).toBeGreaterThan(80);
        for (const table of ["skill_evidence", "project_experience", "career_interests", "person_preferences", "team_proposals", "proposal_seats", "assignments", "shortlists", "expressions_of_interest"]) {
          expect(rows(await api.get(t, `${table}?select=*`)), table).toEqual([]);
        }
      });
      it("only staffing leads have shortlists, and a delivery lead cannot create a proposal", async () => {
        expect(refused(await api.write(await token("rafael"), "POST", "shortlists", { owner_id: U.rafael, person_id: P("ana") }))).toBe(true);
        expect(refused(await api.write(await token("rafael"), "POST", "team_proposals", { title: "x" }))).toBe(true);
        expect(refused(await api.write(await token("ana"), "POST", "team_proposals", { title: "x" }))).toBe(true);
      });
    });

    describe("private data isolation", () => {
      const interestsOf = async (who: Parameters<typeof token>[0]) => rows(await api.get(await token(who), `career_interests?select=person_id,interest,selected,shared_with_staffing&person_id=eq.${P("ana")}`));
      it("an owner sees all her interests; staffing sees only the ones she selected AND shared; nobody else sees any", async () => {
        const own = await interestsOf("ana");
        const privateLabels = own.filter((r) => r.selected && !r.shared_with_staffing).map((r) => r.interest as string);
        expect(privateLabels.length).toBeGreaterThan(0);
        const staff = await interestsOf("laura");
        expect(staff.length).toBeGreaterThan(0);
        expect(staff.every((r) => r.selected === true && r.shared_with_staffing === true)).toBe(true);
        for (const label of privateLabels) expect(staff.map((r) => r.interest)).not.toContain(label); // not even their existence
        for (const who of ["lucia", "rafael", "ines", "admin"] as const) expect(await interestsOf(who), who).toEqual([]);
      });
      it("work preferences are visible to staffing only while shared, and withdrawing consent takes effect on the next request", async () => {
        const path = `person_preferences?select=person_id,shared_with_staffing&person_id=eq.${P("ana")}`;
        const ana = await token("ana"), laura = await token("laura");
        const before = rows(await api.get(ana, path))[0];
        expect(before, "the seed shares Ana's preferences").toMatchObject({ shared_with_staffing: true });
        try {
          expect((await api.write(ana, "PATCH", `person_preferences?person_id=eq.${P("ana")}`, { shared_with_staffing: false })).status).toBeLessThan(300);
          expect(rows(await api.get(laura, path))).toEqual([]);
          for (const who of ["lucia", "rafael", "ines", "admin"] as const) expect(rows(await api.get(await token(who), path)), who).toEqual([]);
        } finally {
          await api.write(ana, "PATCH", `person_preferences?person_id=eq.${P("ana")}`, { shared_with_staffing: true });
        }
        expect(rows(await api.get(laura, path))).toHaveLength(1);
      });
      it("another engineer cannot read or write Ana's private rows", async () => {
        const lucia = await token("lucia");
        expect(rows(await api.get(lucia, `career_interests?person_id=eq.${P("ana")}`))).toEqual([]);
        expect(rows(await api.write(lucia, "PATCH", `career_interests?person_id=eq.${P("ana")}`, { shared_with_staffing: true }))).toEqual([]);
        expect(refused(await api.write(lucia, "POST", "career_interests", { person_id: P("ana"), interest: "x", selected: true }))).toBe(true);
      });
    });

    describe("evidence protection", () => {
      const KMP = E("ana-ev-5"); // Ana's self-reported evidence
      const RN = E("ana-ev-1"); // Ana's verified evidence
      const evidence = async (who: Parameters<typeof token>[0], id: string) => rows(await api.get(await token(who), `skill_evidence?id=eq.${id}&select=id,label,verification,verified_by,verification_note`))[0];

      it("an owner cannot create verified evidence or set any verification metadata", async () => {
        const ana = await token("ana");
        const base = { person_id: P("ana"), label: `Remote check ${Date.now()}`, source: "professional", detail: "remote test" };
        for (const extra of [{ verification: "verified" }, { verified_by: U.laura }, { verified_at: new Date().toISOString() }, { verification_note: "x" }]) {
          const r = await api.write(ana, "POST", "skill_evidence", { ...base, ...extra });
          expect(refused(r), JSON.stringify(extra)).toBe(true);
          expect(rows(r)).toEqual([]);
        }
      });
      it("an owner can add a self-reported row (whatever source she picks), and withdraw it again", async () => {
        const ana = await token("ana");
        const label = `Remote check ${Date.now()}`;
        const r = await api.write(ana, "POST", "skill_evidence", { person_id: P("ana"), label, source: "professional", detail: "remote test" });
        expect(r.status, message(r)).toBe(201);
        const row = rows(r)[0]!;
        try {
          expect(row).toMatchObject({ verification: "self_reported", verified_by: null, verified_at: null });
        } finally {
          await api.write(ana, "DELETE", `skill_evidence?id=eq.${row.id}`);
        }
        expect(await evidence("ana", row.id)).toBeUndefined();
      });
      it("an owner cannot edit or delete verified evidence, and cannot give herself verification", async () => {
        const ana = await token("ana");
        const before = await evidence("ana", RN);
        expect(before?.verification).toBe("verified");
        expect(rows(await api.write(ana, "PATCH", `skill_evidence?id=eq.${RN}`, { label: "Rewritten" }))).toEqual([]);
        expect(rows(await api.write(ana, "DELETE", `skill_evidence?id=eq.${RN}`))).toEqual([]);
        expect(refused(await api.write(ana, "PATCH", `skill_evidence?id=eq.${KMP}`, { verification: "verified" }))).toBe(true);
        expect(refused(await api.write(ana, "PATCH", `skill_evidence?id=eq.${KMP}`, { verified_by: U.rafael }))).toBe(true);
        expect(await evidence("ana", RN)).toEqual(before);
        expect((await evidence("ana", KMP))?.verification).toBe("self_reported");
      });
      it("only a reviewer with a working relationship can decide: the owner, staff, an unrelated delivery lead and an administrator are refused", async () => {
        for (const who of ["ana", "laura", "ines", "admin"] as const) {
          const r = await api.rpc(await token(who), "decide_evidence_verification", { p_kind: "skill", p_id: KMP, p_decision: "verify", p_note: null });
          expect(refused(r), who).toBe(true);
          expect(message(r), who).toMatch(/not an authorized reviewer/);
        }
        const daniel = await api.rpc(await token("rafael"), "decide_evidence_verification", { p_kind: "skill", p_id: E("daniel-ev-1"), p_decision: "verify", p_note: null });
        expect(message(daniel)).toMatch(/not an authorized reviewer/); // the role alone is not enough: Daniel is Ines's
        expect((await evidence("ana", KMP))?.verification).toBe("self_reported");
      });
      it("column grants hide what a row policy cannot: select=* on app_users is refused, naming the columns works", async () => {
        const ana = await token("ana");
        expect(refused(await api.get(ana, "app_users?select=*&limit=1"))).toBe(true);
        const ok = await api.get(ana, "app_users?select=id,display_name,title&limit=3");
        expect(ok.status).toBe(200);
        expect(Object.keys(rows(ok)[0]!).sort()).toEqual(["display_name", "id", "title"]);
        expect(refused(await api.get(ana, "app_users?select=person_id&limit=1"))).toBe(true);
      });
    });

    describe("privilege escalation is prevented", () => {
      it("nobody can give themselves a role, and an administrator cannot change their own", async () => {
        const grant = (who: Parameters<typeof token>[0], user: string, role: string) => token(who).then((t) => api.rpc(t, "grant_user_role", { p_user: user, p_role: role }));
        expect(message(await grant("ana", U.ana, "admin"))).toMatch(/administrators only/);
        expect(message(await grant("laura", U.laura, "admin"))).toMatch(/administrators only/);
        expect(message(await grant("rafael", U.ana, "staffing_lead"))).toMatch(/administrators only/);
        expect(message(await grant("admin", U.admin, "staffing_lead"))).toMatch(/cannot change their own roles/);
        const link = await api.rpc(await token("admin"), "link_user_profile", { p_user: U.admin, p_person: P("ana") });
        expect(message(link)).toMatch(/cannot link their own profile/);
        expect((await api.rpc(await token("ana"), "my_identity")).json.roles).toEqual(["engineer"]);
      });
      it("role tables, reviewer assignments, audit rows and reviews cannot be written through the API by anyone", async () => {
        for (const who of ["ana", "laura", "rafael", "admin"] as const) {
          const t = await token(who);
          expect(refused(await api.write(t, "POST", "user_roles", { user_id: U[who], role: "admin" })), `${who} user_roles insert`).toBe(true);
          expect(refused(await api.write(t, "DELETE", "user_roles?role=eq.admin")), `${who} user_roles delete`).toBe(true);
          expect(refused(await api.write(t, "POST", "opportunity_delivery_leads", { opportunity_id: seedId("opportunity", "vela"), user_id: U[who] })), `${who} reviewer insert`).toBe(true);
          expect(refused(await api.write(t, "POST", "audit_log", { actor_id: U[who], action: "x.y", subject_type: "x" })), `${who} audit insert`).toBe(true);
          expect(refused(await api.write(t, "PATCH", "audit_log?action=eq.evidence.verify", { action: "x.y" })), `${who} audit update`).toBe(true);
          expect(refused(await api.write(t, "DELETE", "audit_log?id=gt.0")), `${who} audit delete`).toBe(true);
          expect(refused(await api.write(t, "POST", "proposal_reviews", { proposal_id: U.ana, proposal_version: 1, reviewer_id: U[who], decision: "approved" })), `${who} review insert`).toBe(true);
          expect(refused(await api.write(t, "POST", "assignments", { person_id: P("ana"), project_name: "x", starts_on: "2030-01-01", delivery_lead_id: U[who], confirmed_by: U[who] })), `${who} assignment insert`).toBe(true);
        }
      });
      it("identity columns are not writable: nobody re-links their own profile or rewrites their id", async () => {
        for (const who of ["ana", "lucia", "admin"] as const) {
          const t = await token(who);
          expect(refused(await api.write(t, "PATCH", `app_users?id=eq.${U[who]}`, { person_id: P("lucia") })), `${who} person_id`).toBe(true);
          expect(refused(await api.write(t, "PATCH", `app_users?id=eq.${U[who]}`, { id: U.laura })), `${who} id`).toBe(true);
        }
        expect(refused(await api.write(await token("ana"), "PATCH", `people?id=eq.${P("ana")}`, { name: "Someone Else", years_experience: 40 }))).toBe(true); // HR facts are not the owner's to edit
      });
      it("a profile owner edits only her own descriptive fields; someone else's row is simply not there to change", async () => {
        expect(rows(await api.write(await token("lucia"), "PATCH", `people?id=eq.${P("ana")}`, { summary: "Hijacked summary that is long enough" }))).toEqual([]);
        expect(rows(await api.write(await token("laura"), "PATCH", `people?id=eq.${P("ana")}`, { summary: "Staff cannot edit passports either" }))).toEqual([]);
        const ana = rows(await api.get(await token("laura"), `people?id=eq.${P("ana")}&select=summary`))[0]!;
        expect(ana.summary).not.toMatch(/Hijacked|Staff cannot/);
      });
    });

    describe("only the intended schema is reachable through the API", () => {
      it.each(["private", "legacy_0001", "sparq_migrations", "auth", "storage", "extensions"])("schema %s is not exposed (read and write profiles)", async (schema) => {
        const t = await token("laura");
        expect(refused(await api.get(t, "people?limit=1", { "accept-profile": schema })), `read ${schema}`).toBe(true);
        expect(refused(await api.request(t, "POST", "/rest/v1/rpc/has_role", { body: { p_role: "admin" }, headers: { "content-profile": schema } })), `rpc ${schema}`).toBe(true);
      });
      it("helper functions live in a private schema: none is callable as a public RPC", async () => {
        for (const fn of ["has_role", "is_admin", "owns_person", "leads_opportunity", "can_read_profile", "require_actor", "write_audit"]) {
          expect(refused(await api.rpc(await token("laura"), fn, {})), fn).toBe(true);
        }
      });
      it("archived and migration-history tables are not reachable as tables either", async () => {
        for (const t of ["profiles", "sparq_migrations.applied", "applied", "legacy_0001.people"]) expect(refused(await api.get(await token("admin"), `${encodeURIComponent(t)}?limit=1`)), t).toBe(true);
      });
    });

    describe("the daily Ask Sparq limit is the caller's own and cannot be tampered with", () => {
      it("usage rows are not readable or writable by any role, and the function validates its limit", async () => {
        for (const who of ["ana", "laura", "admin"] as const) {
          const t = await token(who);
          expect(refused(await api.get(t, "assistant_usage?select=*")), `${who} read`).toBe(true);
          expect(refused(await api.write(t, "PATCH", "assistant_usage?calls=gt.0", { calls: 0 })), `${who} reset`).toBe(true);
        }
        expect(message(await api.rpc(await token("ana"), "consume_assistant_quota", { p_limit: 0 }))).toMatch(/between 1 and 1000/);
        expect(message(await api.rpc(await token("ana"), "consume_assistant_quota", { p_limit: 100000 }))).toMatch(/between 1 and 1000/);
      });
    });

    afterAll(() => undefined);
  });
}
