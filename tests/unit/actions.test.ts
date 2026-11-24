/**
 * Server-action contract (phase 2A.1): every action validates input, checks the role, and always RETURNS a typed
 * result. Unauthorised callers and unexpected failures never throw to the client and never mutate data.
 * The persona cookie is simulated by mocking next/headers; repositories are the real in-memory adapter.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ persona: undefined as string | undefined, revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "sparq_demo_persona" && state.persona ? { value: state.persona } : undefined) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => state.revalidate(...args) }));

import { getRepositories } from "@/data/repositories";
import { resetMemoryStore } from "@/data/repositories/memory";
import { addExperience, addSkill, removeSkill, toggleInterest, updateSummary } from "@/features/passport/actions";
import { toggleShortlist } from "@/features/shortlist/actions";
import { ForbiddenError, requireRole } from "@/lib/session";

const snapshotAna = async () => {
  const t = getRepositories().talent;
  return JSON.stringify({ person: await t.getPerson("ana"), projects: await t.listProjects("ana"), interests: await t.getCareerInterests("ana") });
};

beforeEach(() => {
  resetMemoryStore();
  state.persona = undefined; // default persona = staffing lead
  state.revalidate.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("requireRole", () => {
  it("throws a typed ForbiddenError for the wrong role and returns the user for the right one", async () => {
    state.persona = "engineer";
    await expect(requireRole("staffing_lead")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requireRole("engineer")).resolves.toMatchObject({ role: "engineer", personId: "ana" });
  });
});

describe("passport actions", () => {
  it("lets the owner (engineer persona) change their own passport and revalidates the affected pages", async () => {
    state.persona = "engineer";
    const text = "A summary written by the owner that is long enough.";
    expect(await updateSummary({ summary: text })).toEqual({ ok: true });
    expect((await getRepositories().talent.getPerson("ana"))!.person.summary).toBe(text);
    expect(state.revalidate).toHaveBeenCalledWith("/me/passport");
    expect(state.revalidate).toHaveBeenCalledWith("/people/ana");
  });

  const attempts: [string, () => Promise<unknown>][] = [
    ["updateSummary", () => updateSummary({ summary: "An attempt by the wrong persona to rewrite it." })],
    ["addSkill", () => addSkill({ label: "Injected skill", level: "professional" })],
    ["removeSkill", () => removeSkill({ evidenceId: "ana-ev-1" })],
    ["addExperience", () => addExperience({ title: "Injected project", role: "Lead", what: "Written by someone who is not the owner." })],
    ["toggleInterest", () => toggleInterest({ interest: "Applied AI in mobile" })],
  ];

  it.each(attempts)("%s as a staffing lead returns a typed error, does not throw, and changes nothing", async (_name, attempt) => {
    state.persona = undefined;
    const before = await snapshotAna();
    const result = await attempt();
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/only the owner/i) });
    expect(await snapshotAna()).toBe(before);
    expect(state.revalidate).not.toHaveBeenCalled();
  });

  it("still validates input first, with the existing messages", async () => {
    state.persona = "engineer";
    const before = await snapshotAna();
    expect(await updateSummary({ summary: "short" })).toEqual({ ok: false, error: "Write at least 20 characters" });
    expect(await addSkill({ label: "x", level: "professional" })).toMatchObject({ ok: false });
    expect(await addSkill({ label: "Valid label", level: "expert" })).toMatchObject({ ok: false });
    expect(await removeSkill({ evidenceId: "" })).toEqual({ ok: false, error: "Invalid skill" });
    expect(await addExperience({ title: "ab", role: "r", what: "short" })).toMatchObject({ ok: false });
    expect(await toggleInterest({ interest: "" })).toEqual({ ok: false, error: "Invalid interest" });
    expect(await snapshotAna()).toBe(before);
  });

  it("scopes writes to the session's own person: an owner cannot remove someone else's evidence", async () => {
    state.persona = "engineer";
    const lucia = (await getRepositories().talent.getPerson("lucia"))!.evidence;
    expect(lucia.length).toBeGreaterThan(0);
    await removeSkill({ evidenceId: lucia[0]!.id });
    expect((await getRepositories().talent.getPerson("lucia"))!.evidence).toHaveLength(lucia.length);
  });

  it("turns unexpected repository failures into a typed error (not reported as 'forbidden')", async () => {
    state.persona = "engineer";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(getRepositories().talent, "addSkill").mockRejectedValueOnce(new Error("database unavailable"));
    const result = await addSkill({ label: "Core ML", level: "independent" });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/try again/i) });
    expect((result as { error: string }).error).not.toMatch(/only the owner/i);
    expect(state.revalidate).not.toHaveBeenCalled();
  });
});

describe("shortlist action", () => {
  it("lets a staffing lead toggle a person", async () => {
    expect(await toggleShortlist({ personId: "ana" })).toEqual({ ok: true, shortlist: ["ana"] });
    expect(await toggleShortlist({ personId: "ana" })).toEqual({ ok: true, shortlist: [] });
  });
  it("returns a typed 'staffing leads only' error to an engineer and changes nothing", async () => {
    state.persona = "engineer";
    expect(await toggleShortlist({ personId: "ana" })).toEqual({ ok: false, error: "Only staffing leads can change a shortlist." });
    state.persona = undefined;
    expect(await getRepositories().shortlists.get("u-laura")).toEqual([]);
  });
  it("rejects unknown people and malformed input", async () => {
    expect(await toggleShortlist({ personId: "ghost" })).toEqual({ ok: false, error: "Person not found" });
    expect(await toggleShortlist({ personId: "" })).toEqual({ ok: false, error: "Invalid person" });
  });
});
