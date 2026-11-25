/**
 * Proposal actions and queries across the four roles (memory adapter, demo persona simulated through next/headers):
 * Zod at the boundary, role checks, typed results (never thrown), PROPOSED ≠ ASSIGNED, and query scoping per viewer.
 * The demo delivery lead is Rafael Ortiz, who leads Vela Bank and Terra Foods.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ persona: undefined as string | undefined, revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (n === "sparq_demo_persona" && state.persona ? { value: state.persona } : undefined) }) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => state.revalidate(...a) }));

import { getRepositories } from "@/data/repositories";
import { resetMemoryStore } from "@/data/repositories/memory";
import { ForbiddenError } from "@/domain/errors";
import { confirmSeatAction, reviewProposalAction, saveProposalAction, submitProposalAction, withdrawProposalAction } from "@/features/proposals/actions";
import { getProposalWorkbench, getReviewInbox } from "@/features/proposals/queries";
import { getOpportunitiesData } from "@/features/opportunities/queries";
import { getSession } from "@/lib/session";

const terra = (over: object = {}) => ({
  opportunityId: "terra", title: "Terra Foods · Data Engineer", brief: "", noteForReviewer: "",
  seats: [{ roleRequirementId: "terra-de1", title: "Data Engineer", capabilities: ["Snowflake", "dbt"], seniority: "Senior", allocation: 1, personId: "priya" }], ...over,
});
const as = (p: string) => { state.persona = p; };
const user = async () => (await getSession())!;

beforeEach(() => { resetMemoryStore(); as("staffing_lead"); state.revalidate.mockClear(); });

async function sentAndApproved() {
  const saved = await saveProposalAction(terra());
  if (!saved.ok) throw new Error(saved.error);
  const id = saved.proposal.id;
  expect((await submitProposalAction({ id, note: "Priya is free Feb 16" })).ok).toBe(true);
  as("delivery_lead");
  const r = await reviewProposalAction({ id, decision: "approved" });
  if (!r.ok) throw new Error(r.error);
  return { id, seatId: r.proposal.seats[0]!.id };
}

describe("authorization matrix of the proposal actions", () => {
  it.each([["engineer"], ["delivery_lead"], ["admin"]])("%s cannot write, submit or withdraw proposals", async (persona) => {
    as("staffing_lead");
    const saved = await saveProposalAction(terra());
    const id = saved.ok ? saved.proposal.id : "";
    as(persona);
    for (const r of [await saveProposalAction(terra()), await submitProposalAction({ id }), await withdrawProposalAction({ id })]) expect(r).toMatchObject({ ok: false, error: expect.any(String) });
    expect((await getRepositories().proposals.list({ id: "u-laura", role: "staffing_lead", personId: null })).find((p) => p.id === id)?.state).toBe("draft");
  });

  it.each([["staffing_lead"], ["engineer"], ["admin"]])("%s cannot review or confirm", async (persona) => {
    const { id, seatId } = await sentAndApproved().catch(() => ({ id: "", seatId: "" }));
    as(persona);
    expect(await reviewProposalAction({ id, decision: "approved" })).toMatchObject({ ok: false });
    expect(await confirmSeatAction({ seatId, startsOn: "2027-02-09" })).toMatchObject({ ok: false });
  });

  it("no session → typed error, nothing mutated", async () => {
    state.persona = undefined;
    expect(await saveProposalAction(terra())).toEqual({ ok: false, error: expect.stringMatching(/session/i) });
  });

  it("invalid input is rejected by Zod, including smuggled state", async () => {
    expect((await saveProposalAction({ ...terra(), state: "approved" })).ok).toBe(false);
    expect((await saveProposalAction(terra({ seats: [] }))).ok).toBe(false);
    expect((await saveProposalAction(terra({ seats: [{ title: "x", capabilities: [], allocation: 3 }] }))).ok).toBe(false);
    expect((await reviewProposalAction({ id: "p-vela", decision: "declined" })).ok).toBe(false); // a decline needs a note
    expect((await confirmSeatAction({ seatId: "s", startsOn: "tomorrow" })).ok).toBe(false);
  });

  it("the wrong delivery lead (not leading that opportunity) cannot review, and the author cannot", async () => {
    as("staffing_lead");
    const saved = await saveProposalAction(terra({ opportunityId: "cobalt", seats: [{ roleRequirementId: "cobalt-ios", title: "iOS", capabilities: ["Swift"], seniority: null, allocation: 1, personId: "javier" }] }));
    expect(saved.ok).toBe(true);
    const id = saved.ok ? saved.proposal.id : "";
    await submitProposalAction({ id });
    as("delivery_lead"); // Rafael: not Cobalt's lead (Inés)
    expect(await reviewProposalAction({ id, decision: "approved" })).toMatchObject({ ok: false, error: expect.stringMatching(/assigned to this opportunity/i) });
    as("staffing_lead");
    expect(await reviewProposalAction({ id, decision: "approved" })).toMatchObject({ ok: false });
  });
});

describe("the happy path keeps proposed ≠ assigned", () => {
  it("save → submit → review → confirm; approving assigns nobody; confirming does", async () => {
    const { id, seatId } = await sentAndApproved();
    const repos = getRepositories();
    const rafael = await user();
    expect((await repos.planning.listAssignments(rafael)).filter((a) => a.opportunityId === "terra")).toHaveLength(0);
    const c = await confirmSeatAction({ seatId, startsOn: "2027-02-16", endsOn: "2027-07-15", availableFrom: "2027-07-16" });
    expect(c).toMatchObject({ ok: true, assignment: { personId: "priya", opportunityId: "terra", deliveryLeadName: "Rafael Ortiz" } });
    expect((await repos.proposals.get(rafael, id))?.seats[0]?.seatState).toBe("confirmed");
    expect(await confirmSeatAction({ seatId, startsOn: "2027-02-16" })).toMatchObject({ ok: false, error: expect.stringMatching(/already confirmed/i) });
    expect(state.revalidate).toHaveBeenCalled();
  });

  it("a full-time conflict is refused with a clear message", async () => {
    const { seatId } = await sentAndApproved();
    const r = await confirmSeatAction({ seatId, startsOn: "2026-12-01" }); // Priya is on Lumen Retail until Feb 13
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/full-time/i) });
  });

  it("a returned proposal is edited and resent as version 2; a withdrawn one is final", async () => {
    const saved = await saveProposalAction(terra());
    const id = saved.ok ? saved.proposal.id : "";
    await submitProposalAction({ id });
    as("delivery_lead");
    expect(await reviewProposalAction({ id, decision: "changes_requested", note: "Add dbt evidence" })).toMatchObject({ ok: true });
    as("staffing_lead");
    expect(await saveProposalAction(terra({ id }))).toMatchObject({ ok: true });
    expect(await submitProposalAction({ id })).toMatchObject({ ok: true, proposal: { version: 2, state: "submitted" } });
    expect(await withdrawProposalAction({ id })).toMatchObject({ ok: true, proposal: { state: "withdrawn" } });
    expect(await saveProposalAction(terra({ id }))).toMatchObject({ ok: false });
  });
});

describe("query scoping", () => {
  it("the workbench is for staffing leads only", async () => {
    for (const p of ["engineer", "delivery_lead", "admin"]) { as(p); await expect(getProposalWorkbench(await user())).rejects.toBeInstanceOf(ForbiddenError); }
    as("staffing_lead");
    const wb = await getProposalWorkbench(await user(), { opportunityId: "terra" });
    expect(wb).toMatchObject({ opportunity: { id: "terra" }, reviewerName: "Rafael Ortiz", today: "2026-11-24" });
    expect(wb.candidates).toHaveLength(12);
    expect(wb.sharedInterests.map((e) => e.personId)).toEqual(["ana"]);
    expect(wb.myDrafts).toEqual([]);
  });

  it("a delivery lead sees only their opportunities and the non-draft proposals of those", async () => {
    as("staffing_lead");
    const draft = await saveProposalAction(terra());
    expect(draft.ok && (await getProposalWorkbench(await user(), { proposalId: draft.proposal.id })).myDrafts).toHaveLength(1);
    as("delivery_lead");
    const rafael = await user();
    const data = await getOpportunitiesData(rafael);
    expect(data.all.map((o) => o.id).sort()).toEqual(["terra", "vela"]);
    const inbox = await getReviewInbox(rafael);
    expect(inbox.proposals.map((p) => p.id)).toEqual(["p-vela"]); // the Terra draft is private to its author
    expect(inbox.canReview).toBe(true);
    expect(Object.keys(inbox.people).sort()).toEqual(["camila", "lucia"]); // only people in proposals they may see
    expect(inbox.people.lucia?.person.workPreferences).toBeUndefined();
  });

  it("engineers and admins have no access to the inbox or the opportunities data", async () => {
    for (const p of ["engineer", "admin"]) { as(p); const u = await user(); await expect(getReviewInbox(u)).rejects.toBeInstanceOf(ForbiddenError); await expect(getOpportunitiesData(u)).rejects.toBeInstanceOf(ForbiddenError); }
  });
});
