/**
 * Passport/shortlist actions under the 2B.1 rules: explicit session, central policy, evidence rules and typed results.
 * (The role-by-role matrix for the original five actions lives in actions.test.ts.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ persona: undefined as string | undefined, revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (n === "sparq_demo_persona" && state.persona ? { value: state.persona } : undefined) }) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => state.revalidate(...a) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); } }));

import { getRepositories } from "@/data/repositories";
import { resetMemoryStore } from "@/data/repositories/memory";
import { addExperience, addSkill, removeSkill, setInterestVisibility, setWorkPreferencesVisibility, toggleInterest, updateSummary } from "@/features/passport/actions";
import { toggleShortlist } from "@/features/shortlist/actions";

const evidenceOf = async (id: string) => (await getRepositories().talent.getPerson(id))!.evidence;
const snapshot = async () => JSON.stringify({ a: await getRepositories().talent.getPerson("ana"), p: await getRepositories().talent.listProjects("ana"), i: await getRepositories().talent.getCareerInterests("ana") });

beforeEach(() => { resetMemoryStore(); state.persona = "engineer"; state.revalidate.mockClear(); });
afterEach(() => vi.restoreAllMocks());

describe("no session: every action returns a typed 'signed out' error and changes nothing", () => {
  const attempts: [string, () => Promise<unknown>][] = [
    ["updateSummary", () => updateSummary({ summary: "A summary that is long enough to pass." })],
    ["addSkill", () => addSkill({ label: "Terraform", level: "professional" })],
    ["removeSkill", () => removeSkill({ evidenceId: "ana-ev-5" })],
    ["addExperience", () => addExperience({ title: "Project", role: "Role", what: "Something I did, written long enough." })],
    ["toggleInterest", () => toggleInterest({ interest: "Fintech" })],
    ["setInterestVisibility", () => setInterestVisibility({ interest: "Fintech", shared: true })],
    ["setWorkPreferencesVisibility", () => setWorkPreferencesVisibility({ shared: false })],
    ["toggleShortlist", () => toggleShortlist({ personId: "ana" })],
  ];
  it.each(attempts)("%s", async (_n, attempt) => {
    state.persona = undefined;
    const before = await snapshot();
    expect(await attempt()).toEqual({ ok: false, error: expect.stringMatching(/session has ended/i) });
    expect(await snapshot()).toBe(before);
    expect(state.revalidate).not.toHaveBeenCalled();
  });
  it("a forged persona value is not a session either", async () => {
    state.persona = "superuser";
    expect(await updateSummary({ summary: "A summary that is long enough to pass." })).toMatchObject({ ok: false });
  });
});

describe("cross-role profile mutations are refused", () => {
  it("a staffing lead cannot perform ANY owner-only mutation", async () => {
    state.persona = "staffing_lead";
    const before = await snapshot();
    for (const result of [
      await updateSummary({ summary: "A summary that is long enough to pass." }),
      await addSkill({ label: "Terraform", level: "professional" }),
      await removeSkill({ evidenceId: "ana-ev-5" }),
      await addExperience({ title: "Project", role: "Role", what: "Something written long enough." }),
      await toggleInterest({ interest: "Fintech" }),
      await setInterestVisibility({ interest: "Fintech", shared: true }),
      await setWorkPreferencesVisibility({ shared: false }),
    ]) expect(result).toEqual({ ok: false, error: expect.stringMatching(/only the owner/i) });
    expect(await snapshot()).toBe(before);
  });
  it("an engineer cannot use the staffing shortlist", async () => {
    expect(await toggleShortlist({ personId: "lucia" })).toEqual({ ok: false, error: "Only staffing leads can change a shortlist." });
    expect(await getRepositories().shortlists.get("u-laura")).toEqual([]);
  });
  it("an engineer's writes only ever land on their own passport, whatever ids the payload carries", async () => {
    const luciaBefore = JSON.stringify(await getRepositories().talent.getPerson("lucia"));
    await updateSummary({ summary: "A new summary for the owner only, long enough.", personId: "lucia" } as never);
    await toggleInterest({ interest: "Fintech", personId: "lucia" } as never);
    expect(JSON.stringify(await getRepositories().talent.getPerson("lucia"))).toBe(luciaBefore);
    expect((await getRepositories().talent.getPerson("ana"))!.person.summary).toMatch(/^A new summary for the owner only/);
  });
  it("removing someone else's evidence id is a typed error and removes nothing", async () => {
    const lucia = await evidenceOf("lucia");
    const unverified = lucia.find((e) => e.verification !== "verified")!;
    expect(await removeSkill({ evidenceId: unverified.id })).toEqual({ ok: false, error: expect.stringMatching(/isn’t on your passport/) });
    expect(await evidenceOf("lucia")).toEqual(lucia);
  });
});

describe("self-reported versus verified evidence, through the actions", () => {
  it("anything an owner adds is self-reported, even professional experience", async () => {
    expect(await addSkill({ label: "Terraform", level: "professional" })).toEqual({ ok: true });
    const added = (await evidenceOf("ana")).find((e) => e.label === "Terraform")!;
    expect(added).toMatchObject({ level: "professional", verification: "self_reported" });
    expect(added.verifiedBy).toBeUndefined();
  });
  it("a payload that tries to set verification is rejected, and nothing is added", async () => {
    const before = await evidenceOf("ana");
    for (const smuggled of [{ verification: "verified" }, { verifiedBy: "Rafael Ortiz" }, { verifiedOn: "2026-11" }, { selfReported: false }]) {
      expect(await addSkill({ label: "Terraform", level: "professional", ...smuggled } as never)).toMatchObject({ ok: false });
    }
    expect(await evidenceOf("ana")).toEqual(before);
  });
  it("a new project is self-reported and says so", async () => {
    await addExperience({ title: "Kestrel discovery sprint", role: "Mobile advisor", what: "Ran a two-week discovery sprint." });
    const p = (await getRepositories().talent.listProjects("ana")).find((x) => x.title === "Kestrel discovery sprint")!;
    expect(p.verification).toBe("self_reported");
    expect(p.verifiedBy).toBeUndefined();
  });
  it("a duplicate (same capability and source) is refused with a clear message", async () => {
    await addSkill({ label: "Terraform", level: "independent" });
    expect(await addSkill({ label: "Terraform", level: "independent" })).toEqual({ ok: false, error: "That is already on your passport with the same source." });
    expect((await evidenceOf("ana")).filter((e) => e.label === "Terraform")).toHaveLength(1);
  });
});

describe("confirmed evidence is protected", () => {
  it("the owner cannot remove verified evidence: typed error, row and verification history untouched", async () => {
    const before = await evidenceOf("ana");
    const verified = before.filter((e) => e.verification === "verified");
    expect(verified.length).toBeGreaterThan(5);
    for (const v of verified) {
      expect(await removeSkill({ evidenceId: v.id })).toEqual({ ok: false, error: expect.stringMatching(/verified by a reviewer.*correct it/i) });
    }
    expect(await evidenceOf("ana")).toEqual(before);
    for (const v of verified) expect((await evidenceOf("ana")).find((e) => e.id === v.id)).toMatchObject({ verification: "verified", verifiedBy: v.verifiedBy, verifiedOn: v.verifiedOn });
    expect(state.revalidate).not.toHaveBeenCalled(); // a refused change publishes nothing
  });
  it("unverified claims can be withdrawn; verified evidence stays after a successful withdrawal of another row", async () => {
    await addSkill({ label: "Terraform", level: "professional" });
    const mine = (await evidenceOf("ana")).find((e) => e.label === "Terraform")!;
    expect(await removeSkill({ evidenceId: mine.id })).toEqual({ ok: true });
    expect((await evidenceOf("ana")).some((e) => e.label === "Terraform")).toBe(false);
    expect((await evidenceOf("ana")).filter((e) => e.verification === "verified").length).toBeGreaterThan(5);
  });
  it("there is no action that can verify anything: verification is not a writable field of any owner action", async () => {
    // The only evidence mutations are add (always self-reported) and remove (never verified rows).
    const mod = await import("@/features/passport/actions");
    expect(Object.keys(mod).sort()).toEqual(["addExperience", "addSkill", "removeSkill", "setInterestVisibility", "setWorkPreferencesVisibility", "toggleInterest", "updateSummary"]);
  });
});
