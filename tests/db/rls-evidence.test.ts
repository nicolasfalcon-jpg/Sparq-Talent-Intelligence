/**
 * Evidence integrity under real roles: owners add self-reported evidence and can never verify, forge or erase verification; verified
 * evidence is immutable; verification and revocation belong to authorized reviewers only; the history is append-only.
 * Seed: Ana's verified evidence includes React Native (professional); her self-reported rows include Kotlin Multiplatform (independent).
 * Rafael is a delivery lead with a working relationship to Ana (he leads her assignment); Ines (delivery lead) and Camila (engineer) are not related to her.
 */
import { describe, expect, it } from "vitest";
import { U, seedId } from "@/data/seed/ids";
import { denied, grantRole, seen, tryAs, withDb } from "./setup";

const t = withDb();
const P = (slug: string) => seedId("person", slug);
const E = (id: string) => seedId("evidence", id);
const RN = E("ana-ev-1"); // verified, professional
const KMP = E("ana-ev-5"); // self-reported, independent
const PENDING = E("mateo-ev-6"); // pending (Mateo's independent React Native)
const state = async (id: string) => (await t.db.sql("select verification::text v, verified_by::text by, verified_at is not null has_at, verification_note note, label, detail from skill_evidence where id = $1", [id]))[0]!;
const decide = (who: string, id: string, decision: string, note: string | null = null, kind = "skill") => tryAs(t.db, who, "select public.decide_evidence_verification($1, $2, $3, $4)", [kind, id, decision, note]);
const request = (who: string, id: string, requested: boolean, kind = "skill") => tryAs(t.db, who, "select public.request_evidence_verification($1, $2, $3)", [kind, id, requested]);

describe("an owner can add self-reported evidence, and only that", () => {
  const add = (who: string, cols: string, vals: string) => tryAs(t.db, who, `insert into skill_evidence (person_id, label, source, detail${cols}) values ('${P("ana")}', 'Terraform', 'professional', 'two projects'${vals}) returning id::text id, verification::text v`);

  it("creates a row that is self-reported with no verification metadata, whatever source they choose", async () => {
    for (const source of ["professional", "independent", "training", "emerging"]) {
      const r = await tryAs(t.db, U.ana, "insert into skill_evidence (person_id, label, source) values ($1, $2, $3) returning verification::text v, verified_by, verified_at, verification_note", [P("ana"), `Skill ${source}`, source]);
      expect(r.ok && r.value[0]).toEqual({ v: "self_reported", verified_by: null, verified_at: null, verification_note: null });
    }
  });
  it("cannot name verification metadata at all: the columns are not writable (permission denied, not silently ignored)", async () => {
    for (const [cols, vals] of [[", verification", ", 'verified'"], [", verification", ", 'pending'"], [", verified_by", `, '${U.rafael}'`], [", verified_at", ", now()"], [", verification_note", ", 'trust me'"]] as const) {
      expect(denied(await add(U.ana, cols, vals)), cols).toMatch(/permission denied for table skill_evidence/);
    }
  });
  it("cannot create evidence for someone else", async () => {
    expect(denied(await tryAs(t.db, U.lucia, `insert into skill_evidence (person_id, label, source) values ('${P("ana")}', 'Forged', 'professional')`))).toMatch(/row-level security/);
  });
  it("staffing leads, delivery leads and administrators cannot create or edit anyone's evidence either", async () => {
    for (const who of [U.laura, U.rafael, U.admin]) {
      expect(denied(await tryAs(t.db, who, `insert into skill_evidence (person_id, label, source) values ('${P("ana")}', 'Planted', 'professional')`)), who).toMatch(/row-level security/);
      expect((await seen(t.db, who, `update skill_evidence set detail = 'tampered' where id = '${KMP}' returning id`)).length, who).toBe(0);
    }
    expect((await state(KMP)).detail).not.toBe("tampered");
  });
  it("can edit the content of their own unverified claim, but not move it to another person or change its verification", async () => {
    expect((await tryAs(t.db, U.ana, "update skill_evidence set detail = 'now with more detail' where id = $1 returning id", [KMP])).ok).toBe(true);
    expect((await state(KMP)).detail).toBe("now with more detail");
    expect(denied(await tryAs(t.db, U.ana, "update skill_evidence set verification = 'verified' where id = $1", [KMP]))).toMatch(/permission denied/);
    expect(denied(await tryAs(t.db, U.ana, `update skill_evidence set person_id = '${P("lucia")}' where id = $1`, [KMP]))).toMatch(/permission denied/);
  });
  it("can withdraw (delete) their own unverified claims", async () => {
    expect((await seen(t.db, U.ana, "delete from skill_evidence where id = $1 returning id", [KMP])).length).toBe(1);
    expect(await t.db.sql("select 1 from skill_evidence where id = $1", [KMP])).toEqual([]);
  });
});

describe("verified evidence cannot be silently changed or removed", () => {
  it("the owner can neither edit nor delete a verified row (row security hides it from write statements)", async () => {
    const before = await state(RN);
    expect(before.v).toBe("verified");
    expect((await seen(t.db, U.ana, "update skill_evidence set detail = 'rewritten', label = 'Something else' where id = $1 returning id", [RN])).length).toBe(0);
    expect((await seen(t.db, U.ana, "delete from skill_evidence where id = $1 returning id", [RN])).length).toBe(0);
    expect(await state(RN)).toEqual(before);
  });
  it("it cannot be downgraded or its metadata edited either: the columns are not writable", async () => {
    for (const set of ["verification = 'self_reported'", "verified_by = null", "verified_at = null", "verification_note = 'x'"]) {
      expect(denied(await tryAs(t.db, U.ana, `update skill_evidence set ${set} where id = $1`, [RN])), set).toMatch(/permission denied/);
    }
  });
  it("DEFENSE IN DEPTH: even with row security switched off, the trigger still refuses to touch verified evidence", async () => {
    await t.db.exec("alter table skill_evidence disable row level security");
    const before = await state(RN);
    expect(denied(await tryAs(t.db, U.ana, "update skill_evidence set detail = 'rewritten' where id = $1", [RN]))).toMatch(/verified evidence is read-only/);
    expect(denied(await tryAs(t.db, U.ana, "delete from skill_evidence where id = $1", [RN]))).toMatch(/verified evidence cannot be removed/);
    expect(await state(RN)).toEqual(before);
  });
  it("DEFENSE IN DEPTH: even with column grants widened by mistake, verification cannot be forged or changed by an API role", async () => {
    await t.db.exec("grant insert, update on skill_evidence to authenticated");
    expect(denied(await tryAs(t.db, U.ana, `insert into skill_evidence (person_id, label, source, verification, verified_by, verified_at) values ('${P("ana")}', 'Forged', 'professional', 'verified', '${U.rafael}', now())`))).toMatch(/self-reported and carry no verification metadata/);
    expect(denied(await tryAs(t.db, U.ana, "update skill_evidence set verification = 'verified', verified_by = $2, verified_at = now() where id = $1", [KMP, U.rafael]))).toMatch(/verification can only change through the verification functions/);
    expect((await state(KMP)).v).toBe("self_reported");
  });
  it("the service role cannot forge it either: it is an API role, so the trigger applies to it too", async () => {
    await t.db.exec("grant select, insert, update, delete on skill_evidence to service_role");
    expect(denied(await tryAs(t.db, "service_role", `insert into skill_evidence (person_id, label, source, verification, verified_by, verified_at) values ('${P("ana")}', 'Forged', 'professional', 'verified', '${U.rafael}', now())`))).toMatch(/self-reported and carry no verification metadata/);
    expect(denied(await tryAs(t.db, "service_role", "delete from skill_evidence where id = $1", [RN]))).toMatch(/verified evidence cannot be removed/);
  });
  it("editing the content of a claim awaiting review withdraws the request (the reviewer must not approve what changed)", async () => {
    expect((await request(U.ana, KMP, true)).ok).toBe(true);
    expect((await state(KMP)).v).toBe("pending");
    await tryAs(t.db, U.ana, "update skill_evidence set detail = 'edited after asking' where id = $1", [KMP]);
    expect((await state(KMP)).v).toBe("self_reported");
  });
});

describe("requesting verification (the owner's only lever)", () => {
  it("self-reported -> pending, and back, by the owner; audited", async () => {
    expect((await request(U.ana, KMP, true)).ok).toBe(true);
    expect((await state(KMP)).v).toBe("pending");
    expect((await request(U.ana, KMP, false)).ok).toBe(true);
    expect((await state(KMP)).v).toBe("self_reported");
    const actions = (await t.db.sql("select action from audit_log where subject_id = $1 order by id", [KMP])).map((r) => r.action);
    expect(actions).toEqual(["evidence.request_verification", "evidence.cancel_verification_request"]);
  });
  it("only the owner: not another engineer, not staff, not a reviewer, not an administrator", async () => {
    for (const who of [U.lucia, U.laura, U.rafael, U.admin]) expect(denied(await request(who, KMP, true)), who).toMatch(/only the owner/);
    expect((await state(KMP)).v).toBe("self_reported");
  });
  it("it cannot be used on verified evidence, and cancelling needs a pending request", async () => {
    expect(denied(await request(U.ana, RN, true))).toMatch(/cannot request verification of verified evidence/);
    expect(denied(await request(U.ana, KMP, false))).toMatch(/cannot cancel the request for verification of self_reported evidence/);
  });
  it("rejects an unknown kind and an unknown id", async () => {
    expect(denied(await tryAs(t.db, U.ana, "select public.request_evidence_verification('badge', $1, true)", [KMP]))).toMatch(/unknown evidence kind/);
    expect(denied(await tryAs(t.db, U.ana, "select public.request_evidence_verification('skill', gen_random_uuid(), true)"))).toMatch(/evidence not found/);
  });
});

describe("only an authorized reviewer can verify, decline or revoke", () => {
  it("Rafael (he leads Ana's assignment) can verify her self-reported evidence: stamped with him and the time, audited", async () => {
    expect((await decide(U.rafael, KMP, "verify", "Reviewed the repository")).ok).toBe(true);
    expect(await state(KMP)).toMatchObject({ v: "verified", by: U.rafael, has_at: true, note: "Reviewed the repository" });
    const [event] = await t.db.sql("select action, actor_id::text actor, subject_person_id::text p, details from audit_log where subject_id = $1", [KMP]);
    expect(event).toMatchObject({ action: "evidence.verify", actor: U.rafael, p: P("ana") });
    expect(event!.details).toMatchObject({ label: "Kotlin Multiplatform", from: "self_reported", to: "verified" });
  });
  it("and once verified the owner can no longer remove it", async () => {
    await decide(U.rafael, KMP, "verify");
    expect((await seen(t.db, U.ana, "delete from skill_evidence where id = $1 returning id", [KMP])).length).toBe(0);
    expect((await state(KMP)).v).toBe("verified");
  });
  it("nobody else can: the owner, another engineer, staff, an unrelated delivery lead, a dual-role colleague, an administrator", async () => {
    for (const who of [U.ana, U.lucia, U.laura, U.ines, U.camila, U.admin]) {
      expect(denied(await decide(who, KMP, "verify")), who).toMatch(/not an authorized reviewer/);
    }
    expect((await state(KMP)).v).toBe("self_reported");
  });
  it("the role alone is not enough: a delivery lead with no working relationship to the person is refused", async () => {
    expect(denied(await decide(U.rafael, E("daniel-ev-1"), "verify"))).toMatch(/not an authorized reviewer/); // Daniel is Ines's
    expect(denied(await decide(U.rafael, PENDING, "verify"))).toMatch(/not an authorized reviewer/); // so is Mateo
    expect((await decide(U.ines, PENDING, "verify")).ok).toBe(true);
  });
  it("a reviewer can never decide on their own evidence (separation of duties)", async () => {
    await grantRole(t.db, U.camila, "delivery_lead"); // the seed has one role per account; the database still supports an engineer who is also a delivery lead
    await t.db.sql("insert into assignments (person_id, project_name, starts_on, delivery_lead_id, confirmed_by) values ($1, 'Self', '2027-03-01', $2, $2)", [P("camila"), U.camila]);
    const own = E("camila-ev-1");
    await t.db.sql("update skill_evidence set verification = 'self_reported', verified_by = null, verified_at = null, verification_note = null where id = $1", [own]);
    expect(denied(await decide(U.camila, own, "verify"))).toMatch(/cannot decide on your own evidence/);
  });
  it("declining needs a pending request and a reason; it returns the row to self-reported", async () => {
    expect(denied(await decide(U.ines, PENDING, "decline"))).toMatch(/written reason is required/);
    expect(denied(await decide(U.rafael, KMP, "decline", "no"))).toMatch(/cannot decline evidence that is self_reported/);
    expect((await decide(U.ines, PENDING, "decline", "No link to the project")).ok).toBe(true);
    expect(await state(PENDING)).toMatchObject({ v: "self_reported", by: null, has_at: false });
  });
  it("revoking needs verified evidence and a reason; it clears the stamp and keeps the history", async () => {
    expect(denied(await decide(U.rafael, RN, "revoke"))).toMatch(/written reason is required/);
    expect(denied(await decide(U.rafael, KMP, "revoke", "x"))).toMatch(/cannot revoke evidence that is self_reported/);
    expect((await decide(U.rafael, RN, "revoke", "Client could not confirm the role")).ok).toBe(true);
    expect(await state(RN)).toMatchObject({ v: "self_reported", by: null, has_at: false, note: null });
    expect(denied(await decide(U.ines, RN, "revoke", "not mine"))).toMatch(/not an authorized reviewer|cannot revoke/);
    const events = (await t.db.sql("select action, details ->> 'note' note from audit_log where subject_id = $1 order by id", [RN]));
    expect(events.map((e) => e.action)).toEqual(["evidence.verify", "evidence.revoke"]); // the seeded verification, then the revocation
    expect(events[1]!.note).toBe("Client could not confirm the role");
  });
  it("revoked evidence becomes editable by its owner again; re-verifying adds a second chapter, never rewrites the first", async () => {
    await decide(U.rafael, RN, "revoke", "Re-check");
    expect((await tryAs(t.db, U.ana, "update skill_evidence set detail = 'corrected' where id = $1 returning id", [RN])).ok).toBe(true);
    await decide(U.rafael, RN, "verify", "Re-checked");
    expect((await t.db.sql("select count(*)::int n from audit_log where subject_id = $1", [RN]))[0]!.n).toBe(3);
  });
  it("rejects an unknown decision, an unknown kind and an unknown id", async () => {
    expect(denied(await decide(U.rafael, KMP, "approve"))).toMatch(/unknown decision/);
    expect(denied(await decide(U.rafael, KMP, "verify", null, "badge"))).toMatch(/unknown evidence kind/);
    expect(denied(await tryAs(t.db, U.rafael, "select public.decide_evidence_verification('skill', gen_random_uuid(), 'verify', null)"))).toMatch(/evidence not found/);
  });
  it("an unauthenticated call (no identity in the token) is refused", async () => {
    const r = await t.db.attempt(() => t.db.as("00000000-0000-4000-8000-00000000dead", (q) => q("select public.decide_evidence_verification('skill', $1, 'verify', null)", [KMP])));
    expect(denied(r)).toMatch(/not an authorized reviewer/);
  });
});

describe("professional experience follows the same rules", () => {
  const MERIDIAN = seedId("project", "meridian"); // verified
  const OSS = seedId("project", "oss"); // self-reported
  it("owners add self-reported experience and cannot verify it, or edit and delete verified experience", async () => {
    expect(denied(await tryAs(t.db, U.ana, `insert into project_experience (person_id, client, role, title, verification) values ('${P("ana")}', 'C', 'R', 'T', 'verified')`))).toMatch(/permission denied/);
    expect((await tryAs(t.db, U.ana, `insert into project_experience (person_id, client, role, title) values ('${P("ana")}', 'C', 'R', 'T') returning verification::text v`)).ok).toBe(true);
    expect((await seen(t.db, U.ana, "update project_experience set title = 'rewritten' where id = $1 returning id", [MERIDIAN])).length).toBe(0);
    expect((await seen(t.db, U.ana, "delete from project_experience where id = $1 returning id", [MERIDIAN])).length).toBe(0);
  });
  it("a reviewer verifies and revokes it through the same function; the trigger protects it with row security off", async () => {
    expect((await decide(U.rafael, OSS, "verify", "Public repository checked", "project")).ok).toBe(true);
    expect((await t.db.sql("select verification::text v from project_experience where id = $1", [OSS]))[0]!.v).toBe("verified");
    await t.db.exec("alter table project_experience disable row level security");
    expect(denied(await tryAs(t.db, U.ana, "update project_experience set title = 'x' where id = $1", [OSS]))).toMatch(/verified evidence is read-only/);
    expect((await decide(U.rafael, OSS, "revoke", "Repository was private", "project")).ok).toBe(true);
  });
  it("and the owner can request verification of a project", async () => {
    expect((await request(U.ana, OSS, true, "project")).ok).toBe(true);
    expect((await t.db.sql("select verification::text v from project_experience where id = $1", [OSS]))[0]!.v).toBe("pending");
  });
});

describe("verification history is append-only for application roles", () => {
  it("nobody can update, delete or truncate audit rows through the API, administrators included", async () => {
    for (const who of [U.admin, U.rafael, U.ana, U.laura]) {
      for (const sql of ["update audit_log set action = 'x.y'", "delete from audit_log", "insert into audit_log (actor_id, action, subject_type, subject_id) values (gen_random_uuid(), 'a.b', 'x', gen_random_uuid())", "truncate audit_log"]) {
        expect(denied(await tryAs(t.db, who, sql)), `${who} ${sql}`).toMatch(/permission denied/);
      }
    }
  });
  it("DEFENSE IN DEPTH (1/2): if UPDATE, DELETE and TRUNCATE were granted by mistake, row security still hides every row from the statement", async () => {
    await t.db.exec("grant update, delete, truncate on audit_log to authenticated");
    expect((await seen(t.db, U.admin, "update audit_log set action = 'x.y' returning id")).length).toBe(0);
    expect((await seen(t.db, U.admin, "delete from audit_log returning id")).length).toBe(0);
    expect((await t.db.sql("select count(*)::int n from audit_log"))[0]!.n).toBe(89);
  });
  it("DEFENSE IN DEPTH (2/2): with row security ALSO off, the triggers still refuse UPDATE, DELETE and TRUNCATE", async () => {
    await t.db.exec("grant update, delete, truncate on audit_log to authenticated");
    await t.db.exec("alter table audit_log disable row level security");
    expect(denied(await tryAs(t.db, U.admin, "update audit_log set action = 'x.y'"))).toMatch(/append-only/);
    expect(denied(await tryAs(t.db, U.admin, "delete from audit_log"))).toMatch(/append-only/);
    expect(denied(await tryAs(t.db, U.admin, "truncate audit_log"))).toMatch(/append-only/);
    expect((await t.db.sql("select count(*)::int n from audit_log"))[0]!.n).toBe(89);
  });
  it("the owner of a profile reads its verification history; others do not read someone else's", async () => {
    await decide(U.rafael, KMP, "verify");
    expect((await seen(t.db, U.ana, "select count(*)::int n from audit_log where subject_id = $1", [KMP]))[0]!.n).toBe(1);
    expect((await seen(t.db, U.lucia, "select count(*)::int n from audit_log where subject_id = $1", [KMP]))[0]!.n).toBe(0);
    expect((await seen(t.db, U.laura, "select count(*)::int n from audit_log where subject_id = $1", [KMP]))[0]!.n).toBe(1);
  });
  it("audit rows always identify the actor, the operation, the resource and the time", async () => {
    await decide(U.rafael, KMP, "verify");
    const [row] = await t.db.sql("select actor_id is not null a, action, subject_type, subject_id is not null s, occurred_at is not null t from audit_log where subject_id = $1", [KMP]);
    expect(row).toEqual({ a: true, action: "evidence.verify", subject_type: "skill_evidence", s: true, t: true });
    expect(denied(await t.db.attempt(() => t.db.sql("insert into audit_log (actor_id, action, subject_type, subject_id) values (null, 'a.b', 'x', gen_random_uuid())")))).toMatch(/not-null/);
  });
});
