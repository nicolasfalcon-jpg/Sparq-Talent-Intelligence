import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ persona: undefined as string | undefined, revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (n === "sparq_demo_persona" && state.persona ? { value: state.persona } : undefined) }) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => state.revalidate(...a) }));

import { capabilities } from "@/data/fixtures/capabilities";
import { opportunities, users } from "@/data/fixtures/organization";
import { availability, evidence, people } from "@/data/fixtures/people";
import { getRepositories } from "@/data/repositories";
import { resetMemoryStore } from "@/data/repositories/memory";
import { ForbiddenError } from "@/domain/errors";
import { buildMe } from "@/features/me/model";
import { getMeView } from "@/features/me/queries";
import { expressInterestAction, withdrawInterestAction } from "@/features/me/actions";

const user = (role: string) => users.find((u) => u.role === role)!;
const ana = people.find((p) => p.id === "ana")!;
const base = () => ({
  person: ana, evidence: evidence.filter((e) => e.personId === "ana"), availability: availability.find((a) => a.personId === "ana")!, assignments: [], projectCount: 2,
  ownInterests: ["AI engineering"], published: opportunities.filter((o) => o.status === "Open"), eois: [], catalogue: capabilities, today: "2026-11-24",
});

beforeEach(() => { resetMemoryStore(); state.persona = "engineer"; state.revalidate.mockClear(); });

describe("My Space model", () => {
  it("explains why a role is shown from documented skills and the person's own interests", () => {
    const m = buildMe({ ...base(), ownInterests: ["Mobile architecture"] });
    const lead = m.fits.find((f) => f.roleId === "cobalt-lead");
    expect(lead?.reasons.interests).toContain("Mobile architecture");
    expect(m.fits.every((f) => f.reasons.skills.length + f.reasons.interests.length > 0)).toBe(true);
    expect(m.fits.some((f) => f.reasons.skills.some((s) => /Swift/.test(s)))).toBe(true);
  });
  it("shows only published (open) opportunities it is given, and no proposals or scores", () => {
    const json = JSON.stringify(buildMe(base()));
    expect(json).not.toMatch(/score|rank|percent|proposedPersonId/i);
  });
  it("the checklist is qualitative: counts of things in place, never a percentage", () => {
    const m = buildMe(base());
    expect(m.checklist.length).toBe(5);
    expect(m.checklistDone).toBe(m.checklist.filter((c) => c.done).length);
    expect(JSON.stringify(m)).not.toContain("%");
  });
  it("now/next come from the person's own assignments, falling back to availability", () => {
    const asg = { id: "a", personId: "ana", opportunityId: null, projectName: "Meridian Health", startsOn: "2026-01-05", endsOn: "2026-12-19", availableFrom: "2027-01-05", allocation: 0.5, endConfirmed: true, deliveryLeadId: "u-rafael", deliveryLeadName: "Rafael Ortiz", proposalSeatId: null };
    const m = buildMe({ ...base(), assignments: [asg] });
    expect(m.now).toMatchObject({ project: "Meridian Health", allocationNote: "50% of full-time" });
    expect(m.next.headline).toMatch(/Free from Jan 5/);
    const other = buildMe({ ...base(), assignments: [{ ...asg, personId: "lucia" }] });
    expect(other.now?.project).toBe("Meridian Health"); // availability.currentProject fallback
  });
  it("lists shared expressions of interest and marks the role as shared", () => {
    const eoi = { id: "e", personId: "ana", roleRequirementId: "cobalt-ios", opportunityId: "cobalt", note: "", status: "shared" as const, createdAt: "2026-11-24T10:00:00Z" };
    const m = buildMe({ ...base(), eois: [eoi] });
    expect(m.fits.find((f) => f.roleId === "cobalt-ios")?.shared).toBe(true);
    expect(m.shared).toEqual([{ roleRequirementId: "cobalt-ios", client: "Cobalt Mobility", roleTitle: "iOS Engineer", sharedOn: "2026-11-24" }]);
    // an already-shared interest in a role that is no longer published is still named when the viewer can read it
    const vela = { roleRequirementId: "vela-mobile", opportunityId: "vela", id: "e2", personId: "ana", note: "", status: "shared" as const, createdAt: "2026-11-23T09:00:00Z" };
    expect(buildMe({ ...base(), known: opportunities, eois: [vela] }).shared[0]).toMatchObject({ client: "Vela Bank", roleTitle: "Senior Mobile Engineer" });
  });
});

describe("My Space query", () => {
  it("is for engineers only, about their own person", async () => {
    await expect(getMeView(user("engineer"))).resolves.toMatchObject({ firstName: "Ana" });
    for (const role of ["staffing_lead", "delivery_lead", "admin"]) await expect(getMeView(user(role))).rejects.toBeInstanceOf(ForbiddenError);
    expect(await getMeView({ ...user("engineer"), personId: null })).toBeNull();
  });
  it("only publishes open opportunities and never exposes proposals or the delivery lead to the engineer", async () => {
    const v = (await getMeView(user("engineer")))!;
    expect(v.fits.every((f) => ["cobalt", "terra"].includes(f.opportunityId))).toBe(true); // Open only: not Vela (Staffing) or Nimbus (Upcoming)
    const json = JSON.stringify(v.fits);
    expect(json).not.toContain("Rafael");
    expect(json).not.toContain("Inés");
    expect(json).not.toContain("proposedPersonId");
    expect(json).not.toContain("lucia");
  });
  it("returns the owner's private interests only to the owner", async () => {
    const v = (await getMeView(user("engineer")))!;
    expect(Object.keys(v.interestsAll).length).toBeGreaterThan(0);
  });
});

describe("express / withdraw interest actions", () => {
  it("shares interest in a published role, shows it, and withdraws it immediately", async () => {
    expect(await expressInterestAction({ roleRequirementId: "cobalt-ios", note: "Keen on offline-first." })).toEqual({ ok: true });
    expect(state.revalidate).toHaveBeenCalledWith("/me");
    let v = (await getMeView(user("engineer")))!;
    expect(v.shared.map((s) => s.roleRequirementId).sort()).toEqual(["cobalt-ios", "vela-mobile"]); // vela-mobile: Ana's seeded, already shared expression
    expect(v.fits.find((f) => f.roleId === "cobalt-ios")?.shared).toBe(true);
    expect(await withdrawInterestAction({ roleRequirementId: "cobalt-ios" })).toEqual({ ok: true });
    v = (await getMeView(user("engineer")))!;
    expect(v.shared.map((s) => s.roleRequirementId)).toEqual(["vela-mobile"]);
    expect(v.fits.find((f) => f.roleId === "cobalt-ios")?.shared).toBe(false);
  });
  it("staffing sees the expression only while it is shared", async () => {
    const staff = user("staffing_lead");
    await expressInterestAction({ roleRequirementId: "cobalt-ios", note: "" });
    const ids = async () => (await getRepositories().interests.listSharedFor(staff)).map((e) => e.roleRequirementId).sort();
    expect(await ids()).toEqual(["cobalt-ios", "vela-mobile"]);
    await withdrawInterestAction({ roleRequirementId: "cobalt-ios" });
    expect(await ids()).toEqual(["vela-mobile"]);
    // a delivery lead sees only the expressions for opportunities they lead
    expect((await getRepositories().interests.listSharedFor(user("delivery_lead"))).every((e) => e.opportunityId === "vela")).toBe(true);
  });
  it("refuses roles that are not published, strict input, and every other role or no session", async () => {
    expect(await expressInterestAction({ roleRequirementId: "vela-mobile", note: "" })).toMatchObject({ ok: false, error: expect.stringMatching(/not open/i) });
    expect(await expressInterestAction({ roleRequirementId: "nimbus-arch", note: "" })).toMatchObject({ ok: false });
    expect(await expressInterestAction({ roleRequirementId: "nope", note: "" })).toMatchObject({ ok: false });
    expect(await expressInterestAction({ roleRequirementId: "cobalt-ios", note: "x", personId: "lucia" })).toMatchObject({ ok: false }); // strict: cannot smuggle a person id
    expect(await expressInterestAction({ roleRequirementId: "cobalt-ios", note: "x".repeat(501) })).toMatchObject({ ok: false });
    for (const persona of ["staffing_lead", "delivery_lead", "admin", undefined]) {
      state.persona = persona;
      expect(await expressInterestAction({ roleRequirementId: "cobalt-ios", note: "" })).toMatchObject({ ok: false });
      expect(await withdrawInterestAction({ roleRequirementId: "cobalt-ios" })).toMatchObject({ ok: false });
    }
    expect((await getRepositories().interests.listForPerson("ana")).map((e) => e.roleRequirementId)).toEqual(["vela-mobile"]); // nothing new was stored
  });
});
