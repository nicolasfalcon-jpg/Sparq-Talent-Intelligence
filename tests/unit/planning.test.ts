import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { opportunities, users } from "@/data/fixtures/organization";
import { availability, people } from "@/data/fixtures/people";
import { getRepositories } from "@/data/repositories";
import { resetMemoryStore } from "@/data/repositories/memory";
import { ForbiddenError } from "@/domain/errors";
import type { Assignment } from "@/domain/schemas";
import { buildPlanning, clampOffset, describeBar, planningWindow } from "@/features/planning/model";
import { getPlanningView } from "@/features/planning/queries";

const TODAY = "2026-11-24";
const rows = people.map((p) => ({ person: p, availability: availability.find((a) => a.personId === p.id)! }));
const asg = (over: Partial<Assignment> = {}): Assignment => ({ id: "a1", personId: "ana", opportunityId: null, projectName: "Meridian Health", startsOn: "2026-01-05", endsOn: "2026-12-19", availableFrom: "2027-01-05", allocation: 1, endConfirmed: true, deliveryLeadId: "u-rafael", deliveryLeadName: "Rafael Ortiz", proposalSeatId: null, ...over });

describe("planning model", () => {
  it("windows: weekly starts two days before today (clamped offset); monthly starts on the 1st of the month", () => {
    expect(planningWindow(TODAY, "w").start).toBe("2026-11-22");
    expect(planningWindow(TODAY, "w", 28).start).toBe("2026-12-20");
    expect(planningWindow(TODAY, "m").start).toBe("2026-11-01");
    expect(clampOffset(99999)).toBeLessThanOrEqual(224);
    expect(clampOffset(Number.NaN)).toBe(0);
  });
  it("draws assignments, availability and proposals as separate bars; proposed never replaces an assignment", () => {
    const m = buildPlanning({ rows, assignments: [asg()], opportunities, today: TODAY });
    const ana = m.rows.find((r) => r.person.id === "ana")!;
    expect(ana.bars.map((b) => b.kind)).toEqual(["assignment", "available"]);
    const lucia = m.rows.find((r) => r.person.id === "lucia")!;
    expect(lucia.bars.map((b) => b.kind)).toContain("proposed");
    const proposed = lucia.bars.find((b) => b.kind === "proposed")!;
    const free = lucia.bars.find((b) => b.kind === "available")!;
    expect(free.leftPct + free.widthPct).toBeLessThanOrEqual(proposed.leftPct + 0.01); // free until the proposal starts
    expect(proposed.aria).toMatch(/awaiting human review/);
  });
  it("shows pending availability as a pending bar, and a free-now person from the left edge", () => {
    const m = buildPlanning({ rows, assignments: [], opportunities, today: TODAY });
    expect(m.rows.find((r) => r.person.id === "daniel")!.bars.some((b) => b.kind === "pending")).toBe(true);
    const free = m.rows.find((r) => r.person.id === "lucia")!.bars.find((b) => b.kind === "available")!;
    expect(free.label).toBe("Free now");
  });
  it("places kick-offs in the window and the today marker", () => {
    const m = buildPlanning({ rows, assignments: [], opportunities, today: TODAY });
    expect(m.kickoffs.map((k) => k.opportunityId)).toEqual(["vela", "cobalt", "terra", "nimbus"].filter((id) => m.kickoffs.some((k) => k.opportunityId === id)));
    expect(m.kickoffs.length).toBeGreaterThan(0);
    expect(m.todayPct).not.toBeNull();
    expect(buildPlanning({ rows, assignments: [], opportunities, today: TODAY, offsetDays: 224 }).todayPct).toBeNull();
  });
  it("filters by discipline and lists who is free within 60 days consistently with availability", () => {
    const m = buildPlanning({ rows, assignments: [], opportunities, today: TODAY, discipline: "Mobile" });
    expect(m.rows.every((r) => r.person.discipline === "Mobile")).toBe(true);
    const all = buildPlanning({ rows, assignments: [], opportunities, today: TODAY });
    expect(all.freeSoon.length).toBe(6); // the documented figure: 6 people free within 60 days
  });
  it("describes a selected bar in plain language without scores", () => {
    const m = buildPlanning({ rows, assignments: [asg()], opportunities, today: TODAY });
    const ana = m.rows.find((r) => r.person.id === "ana")!;
    const d = describeBar(ana, "ana:assignment:a1", availability.find((a) => a.personId === "ana")!, [asg()], TODAY)!;
    expect(d.kind).toBe("On a project");
    expect(d.line).toMatch(/Meridian Health until Dec 19/);
    const dan = m.rows.find((r) => r.person.id === "daniel")!;
    expect(describeBar(dan, "daniel:pending", availability.find((a) => a.personId === "daniel")!, [], TODAY)!.pending).toBe(true);
    expect(describeBar(ana, "ana:nope", availability[0]!, [], TODAY)).toBeNull();
  });
});

describe("planning query", () => {
  const user = (role: string) => users.find((u) => u.role === role)!;
  it("is staffing-lead only", async () => {
    resetMemoryStore();
    await expect(getPlanningView({}, user("staffing_lead"))).resolves.toMatchObject({ discipline: "All" });
    for (const role of ["engineer", "delivery_lead", "admin"]) await expect(getPlanningView({}, user(role))).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("reads assignments from the planning repository and tolerates hostile parameters", async () => {
    resetMemoryStore();
    const assignments = await getRepositories().planning.listAssignments(user("staffing_lead"));
    expect(assignments.length).toBeGreaterThan(0);
    const v = await getPlanningView({ view: "zzz", off: "abc", disc: "nope", sel: "ana:../../x" }, user("staffing_lead"));
    expect(v.window.view).toBe("w");
    expect(v.discipline).toBe("All");
    expect(v.selected).toBeNull();
    expect(v.rows.length).toBe(12);
  });
  it("selects a bar through the URL key", async () => {
    resetMemoryStore();
    const v = await getPlanningView({ sel: "daniel:pending" }, user("staffing_lead"));
    expect(v.selected).toMatchObject({ personId: "daniel", pending: true });
  });
});
