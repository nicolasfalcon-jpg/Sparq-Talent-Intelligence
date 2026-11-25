import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { capabilities } from "@/data/fixtures/capabilities";
import { evidence, people } from "@/data/fixtures/people";
import { opportunities, users } from "@/data/fixtures/organization";
import { resetMemoryStore } from "@/data/repositories/memory";
import { ForbiddenError } from "@/domain/errors";
import type { SkillEvidence } from "@/domain/schemas";
import { aggregateInsights, MIN_GROUP } from "@/features/insights/model";
import { getInsightsView } from "@/features/insights/queries";

const ev = (personId: string, capabilityId: string, level: SkillEvidence["level"], verification: SkillEvidence["verification"] = "self_reported"): SkillEvidence =>
  ({ id: `${personId}-${capabilityId}`, personId, capabilityId, label: capabilityId, level, detail: "", verification });
const cap = capabilities.find((c) => c.group === "mobile")!;
const rows = (specs: [string, SkillEvidence["level"], SkillEvidence["verification"]?][]) => specs.map(([id, level, v]) => ({ person: { id }, evidence: [ev(id, cap.id, level, v)] }));
const group = (m: ReturnType<typeof aggregateInsights>) => m.groups.find((g) => g.group === "mobile")!;

describe("insights: minimum group size", () => {
  it("never shows a supply number for 1 or 2 people", () => {
    for (const n of [1, 2]) {
      const m = aggregateInsights(rows(Array.from({ length: n }, (_, i) => [`p${i}`, "professional", "verified"] as [string, "professional", "verified"])), [], capabilities);
      expect(group(m).supply).toEqual({ shown: false, reason: expect.stringMatching(/fewer than 3/i) });
      expect(JSON.stringify(group(m))).not.toMatch(new RegExp(`"total":${n}\\b`));
    }
  });
  it("shows 0 as 0 (not documented is a statement about documentation) and 3 as 3", () => {
    expect(group(aggregateInsights([], [], capabilities)).supply).toEqual({ shown: true, total: 0, split: null });
    const three = aggregateInsights(rows([["a", "professional", "verified"], ["b", "professional", "verified"], ["c", "independent", "verified"]]), [], capabilities);
    expect(group(three).supply).toMatchObject({ shown: true, total: 3, split: { verifiedPractical: 3, needsConfirmation: 0, learning: 0 } });
  });
  it("hides the split when a non-empty part is smaller than the minimum (no disclosure by subtraction)", () => {
    const m = aggregateInsights(rows([["a", "professional", "verified"], ["b", "professional", "verified"], ["c", "professional", "verified"], ["d", "training"]]), [], capabilities);
    expect(group(m).supply).toEqual({ shown: true, total: 4, split: null });
  });
  it("applies the same rule to each capability, and the group counts each person once", () => {
    const [c1, c2] = capabilities.filter((c) => c.group === "mobile");
    const r = ["a", "b", "c"].map((id) => ({ person: { id }, evidence: [ev(id, c1!.id, "professional", "verified"), ev(id, c2!.id, "emerging")] }));
    const m = aggregateInsights(r, [], capabilities);
    expect(group(m).supply).toMatchObject({ total: 3 });
    expect(group(m).capabilities.find((c) => c.id === c1!.id)!.supply).toMatchObject({ shown: true, total: 3 });
  });
  it("uses the best evidence basis of a person within the group (verified practical beats learning)", () => {
    const [c1, c2] = capabilities.filter((c) => c.group === "mobile");
    const r = ["a", "b", "c"].map((id) => ({ person: { id }, evidence: [ev(id, c1!.id, "emerging"), ev(id, c2!.id, "professional", "verified")] }));
    expect(group(aggregateInsights(r, [], capabilities)).supply).toMatchObject({ total: 3, split: { verifiedPractical: 3, learning: 0 } });
  });
  it("the view model contains no person ids, names or scores", () => {
    const m = aggregateInsights(people.map((p) => ({ person: p, evidence: evidence.filter((e) => e.personId === p.id) })), opportunities, capabilities);
    const json = JSON.stringify(m);
    for (const p of people) { expect(json).not.toContain(p.name); expect(json).not.toContain(`"${p.id}"`); }
    expect(json).not.toMatch(/score|rank|percent/i);
    expect(MIN_GROUP).toBe(3);
  });
});

describe("insights: demand", () => {
  it("counts open roles (nobody proposed) per requirement and once per group; unknown labels are listed, not matched", () => {
    const m = aggregateInsights([], opportunities, capabilities);
    expect(m.openRoles).toBe(10); // 12 roles, 2 proposed in the fictional dataset
    expect(m.groups.reduce((n, g) => n + g.demand, 0)).toBeGreaterThan(0);
    expect(m.uncatalogued.every((u) => u.demand > 0)).toBe(true);
    const roleWithTwoMobileCaps = { roles: [{ id: "x", title: "x", capabilities: ["React Native", "Swift"], proposedPersonId: null }] };
    expect(aggregateInsights([], [roleWithTwoMobileCaps], capabilities).groups.find((g) => g.group === "mobile")!.demand).toBe(1);
    const proposed = { roles: [{ id: "y", title: "y", capabilities: ["React Native"], proposedPersonId: "ana" }] };
    expect(aggregateInsights([], [proposed], capabilities).openRoles).toBe(0);
  });
});

describe("insights: authorization", () => {
  const user = (role: string) => users.find((u) => u.role === role)!;
  it("only staffing leads may read it", async () => {
    resetMemoryStore();
    await expect(getInsightsView({}, user("staffing_lead"))).resolves.toMatchObject({ peopleCount: 12 });
    for (const role of ["engineer", "delivery_lead", "admin"]) await expect(getInsightsView({}, user(role))).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("ignores an unknown group in the URL", async () => {
    resetMemoryStore();
    expect((await getInsightsView({ group: "nonsense" }, user("staffing_lead"))).selected).toBeNull();
    expect((await getInsightsView({ group: "ai" }, user("staffing_lead"))).selected).toBe("ai");
  });
});
