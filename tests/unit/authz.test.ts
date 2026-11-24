/**
 * Read authorization. Protected data must not be retrievable by bypassing the UI: every query and the scoped data layer
 * enforce the policy themselves, with typed errors, and the session is strict (no implicit default role).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ persona: undefined as string | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (n === "sparq_demo_persona" && state.persona ? { value: state.persona } : undefined) }) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); }, notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

import { users } from "@/data/fixtures/organization";
import { getRepositories } from "@/data/repositories";
import { resetMemoryStore } from "@/data/repositories/memory";
import { scopedTalent } from "@/data/repositories/scoped";
import { ForbiddenError, UnauthenticatedError } from "@/domain/errors";
import { getHomeView } from "@/features/home/queries";
import { getOpportunitiesData } from "@/features/opportunities/queries";
import { getPassportTitle, getPassportView } from "@/features/passport/queries";
import { getPeopleView } from "@/features/people/queries";
import { guardPage } from "@/lib/access";
import { getSession, getSessionUser, requireRole, requireSession } from "@/lib/session";

const laura = users.find((u) => u.role === "staffing_lead")!;
const ana = users.find((u) => u.role === "engineer")!;

beforeEach(() => { resetMemoryStore(); state.persona = undefined; });

describe("the session is strict: no cookie means no session, never a default role", () => {
  it("getSession returns null without a persona, and for any value that is not a known persona", async () => {
    expect(await getSession()).toBeNull();
    for (const bad of ["admin", "STAFFING_LEAD", "", "engineer ", "__proto__"]) { state.persona = bad; expect(await getSession()).toBeNull(); }
  });
  it("resolves the two demo personas", async () => {
    state.persona = "staffing_lead"; expect(await getSession()).toMatchObject({ role: "staffing_lead" });
    state.persona = "engineer"; expect(await getSession()).toMatchObject({ role: "engineer", personId: "ana" });
  });
  it("requireSession and requireRole throw typed errors", async () => {
    await expect(requireSession()).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(requireRole("engineer")).rejects.toBeInstanceOf(UnauthenticatedError);
    state.persona = "engineer";
    await expect(requireRole("staffing_lead")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requireRole("engineer")).resolves.toMatchObject({ role: "engineer" });
  });
  it("a page without a session is sent to the demo sign-in instead of guessing a role", async () => {
    await expect(getSessionUser()).rejects.toThrow("NEXT_REDIRECT:/persona?as=staffing_lead");
  });
});

describe("queries authorize the viewer themselves (not only the layout redirect)", () => {
  it("engineers cannot read the staffing views, and the error reveals nothing", async () => {
    for (const run of [() => getPeopleView({}, ana), () => getHomeView(ana), () => getOpportunitiesData(ana)]) {
      const err = await run().then(() => null, (e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenError);
      expect((err as Error).message).not.toMatch(/Ruiz|Lucía|Daniel|Vela|Cobalt/);
    }
  });
  it("engineers cannot read another person's passport, nor learn their name through the page title", async () => {
    await expect(getPassportView("lucia", ana)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getPassportTitle("lucia", ana)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("an engineer reads their own passport, as its owner", async () => {
    const v = await getPassportView("ana", ana);
    expect(v).toMatchObject({ isOwner: true, person: { id: "ana" } });
    expect(await getPassportTitle("ana", ana)).toBe("Ana Ruiz · Talent Passport");
  });
  it("staffing leads read every passport, as non-owners", async () => {
    const v = await getPassportView("lucia", laura);
    expect(v).toMatchObject({ isOwner: false, person: { id: "lucia" } });
    expect((await getPeopleView({}, laura)).total).toBe(12);
    expect((await getHomeView(laura)).stats.map((s) => s.value)).toEqual(["4", "10", "6"]);
    expect((await getOpportunitiesData(laura)).all).toHaveLength(4);
  });
  it("an unknown person is 'not found' for staff (null), after authorization", async () => {
    expect(await getPassportView("nobody", laura)).toBeNull();
  });
  it("guardPage turns a ForbiddenError into the viewer's home, and lets other errors through", async () => {
    await expect(guardPage(ana, () => getPeopleView({}, ana))).rejects.toThrow("NEXT_REDIRECT:/me");
    await expect(guardPage(laura, () => getPassportView("x", { ...laura, role: "engineer" } as typeof laura))).rejects.toThrow("NEXT_REDIRECT:/");
    await expect(guardPage(laura, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
  });
});

describe("the scoped data layer is the data-access boundary", () => {
  const repos = () => getRepositories();
  it("an engineer can read nothing about other people through it", async () => {
    const t = scopedTalent(repos(), ana);
    await expect(t.listPeople()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(t.getPerson("lucia")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(t.listProjects("lucia")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(t.getInterests("lucia")).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("an engineer can read their own data", async () => {
    const t = scopedTalent(repos(), ana);
    expect((await t.getPerson("ana"))!.person.id).toBe("ana");
    expect((await t.listProjects("ana")).length).toBeGreaterThan(0);
    expect((await t.getInterests("ana")).isOwner).toBe(true);
  });
  it("staff read people, never the owner's private interests", async () => {
    const t = scopedTalent(repos(), laura);
    expect((await t.listPeople())).toHaveLength(12);
    const i = await t.getInterests("ana");
    expect(i).toEqual({ isOwner: false, all: {}, visible: ["Applied AI in mobile"], shared: [] });
  });
  it("redaction returns copies: hiding something from staff never mutates the stored profile", async () => {
    await repos().talent.setWorkPreferencesShared("ana", false);
    const asStaff = await scopedTalent(repos(), laura).getPerson("ana");
    expect(asStaff!.person.workPreferences).toBeUndefined();
    const asOwner = await scopedTalent(repos(), ana).getPerson("ana");
    expect(asOwner!.person.workPreferences).toMatch(/Open to travel/);
    expect((await repos().talent.getPerson("ana"))!.person.workPreferences).toMatch(/Open to travel/);
  });
});
