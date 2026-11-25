import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { capabilities } from "@/data/fixtures/capabilities";
import { availability, evidence, people, projects } from "@/data/fixtures/people";
import { users } from "@/data/fixtures/organization";
import { getRepositories } from "@/data/repositories";
import { resetMemoryStore } from "@/data/repositories/memory";
import { ForbiddenError } from "@/domain/errors";
import { buildCompare, COMPARE_MAX, parseCompareIds } from "@/features/compare/model";
import { getCompareView } from "@/features/compare/queries";

const row = (id: string) => ({ person: people.find((p) => p.id === id)!, evidence: evidence.filter((e) => e.personId === id), availability: availability.find((a) => a.personId === id)! });
const projectsBy = Object.fromEntries(people.map((p) => [p.id, projects.filter((x) => x.personId === p.id)]));
const build = (ids: string[], reqs: string[], opportunity?: { id: string; client: string; kickoff: string }) =>
  buildCompare({ rows: ids.map(row), requirements: reqs, catalogue: capabilities, today: "2026-11-24", projects: projectsBy, opportunity });

describe("compare model", () => {
  it("keeps the order the viewer chose and never ranks, scores or declares a winner", () => {
    const m = build(["sofia", "ana", "ethan"], ["React Native", "TypeScript"]);
    expect(m.people.map((p) => p.person.id)).toEqual(["sofia", "ana", "ethan"]);
    expect(JSON.stringify(m)).not.toMatch(/score|rank|winner|best fit|percent/i);
  });
  it("shows source and verification separately, and 'not documented' for what nobody wrote down", () => {
    const m = build(["ana", "tomas"], ["React Native", "Kubernetes"]);
    const ana = m.people[0]!.cells[0]!;
    expect(ana.level).not.toBeNull();
    expect(ana.text).toMatch(/professional|independent|training|learning/);
    expect(ana.text).toMatch(/verified|self-reported|pending/);
    const not = build(["ana"], ["Flutter"]).people[0]!.cells[0]!;
    expect(not.text).toBe("not documented");
    expect(not.level).toBeNull();
  });
  it("marks requirements outside the catalogue as such instead of 'no'", () => {
    const c = build(["ana"], ["Quantum widgets"]).people[0]!.cells[0]!;
    expect(c).toMatchObject({ uncatalogued: true, level: null, text: "not documented" });
  });
  it("flags unconfirmed evidence and availability under 'still to confirm'", () => {
    const m = build(["daniel", "ana"], ["Node.js"]);
    expect(m.people[0]!.toConfirm.join(" ")).toMatch(/not confirmed/i);
  });
  it("computes the availability fit against the opportunity kick-off when there is one", () => {
    const m = build(["valentina", "ana"], ["LLM apps"], { id: "vela", client: "Vela Bank", kickoff: "2027-01-12" });
    expect(m.people[0]!.fit?.kind).toBe("late");
    expect(m.context).toMatchObject({ client: "Vela Bank" });
    expect(build(["ana"], ["Swift"]).people[0]!.fit).toBeNull();
  });
  it("limits ids to three, de-duplicates and keeps order", () => {
    expect(parseCompareIds("a,b,a,c,d,e")).toEqual({ ids: ["a", "b", "c"], truncated: true });
    expect(parseCompareIds(undefined)).toEqual({ ids: [], truncated: false });
    expect(COMPARE_MAX).toBe(3);
  });
});

describe("compare query", () => {
  const user = (role: string) => users.find((u) => u.role === role)!;
  it("is staffing-lead only", async () => {
    resetMemoryStore();
    await expect(getCompareView({ ids: "ana,javier" }, user("staffing_lead"))).resolves.toMatchObject({ idsParam: "ana,javier" });
    for (const role of ["engineer", "delivery_lead", "admin"]) await expect(getCompareView({ ids: "ana,javier" }, user(role))).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("uses at most 3 profiles, ignores unknown ids, and derives requirements from a role of an opportunity", async () => {
    resetMemoryStore();
    const v = await getCompareView({ ids: "ana,javier,ethan,sofia,nobody", role: "vela-mobile" }, user("staffing_lead"));
    expect(v.people).toHaveLength(3);
    expect(v.truncated).toBe(true);
    expect(v.requirements).toEqual(["React Native", "TypeScript", "Accessibility"]);
    expect(v.context?.client).toBe("Vela Bank");
    expect(v.roleTitle).toBe("Senior Mobile Engineer");
    const u = await getCompareView({ ids: "nobody", caps: "Swift" }, user("staffing_lead"));
    expect(u.people).toHaveLength(0);
  });
  it("only honours known back links (no open redirect through the URL)", async () => {
    resetMemoryStore();
    const v = await getCompareView({ ids: "ana,javier", from: "https://evil.example" }, user("staffing_lead"));
    expect(v.back.href).toBe("/people");
  });
  it("never carries profile fields beyond what the page shows, and respects withdrawn preference sharing", async () => {
    resetMemoryStore();
    const talent = getRepositories().talent;
    await talent.setWorkPreferencesShared("ana", false);
    const v = await getCompareView({ ids: "ana,javier", caps: "Swift" }, user("staffing_lead"));
    const json = JSON.stringify(v);
    expect(json).not.toContain("Open to travel");
    expect(json).not.toContain("workPreferences");
    expect(json).not.toContain("summary");
    expect(Object.keys(v.people[0]!.person).sort()).toEqual(["headline", "id", "name", "yearsExperience"]);
  });
});
