/**
 * Build a Team wired to the real proposal queries/actions over the memory adapter: the view-model is authorized, minimal and
 * private-data-free, and the real save → submit flow round-trips into what the canvas shows.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ persona: "staffing_lead" as string | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (n === "sparq_demo_persona" && state.persona ? { value: state.persona } : undefined) }) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); } }));

import { users } from "@/data/fixtures/organization";
import { resetMemoryStore } from "@/data/repositories/memory";
import { ForbiddenError } from "@/domain/errors";
import { saveProposalAction, submitProposalAction } from "@/features/proposals/actions";
import { composeSeats, seatsFromProposal, toSaveSeats, isReadOnly } from "@/features/team/model";
import { getTeamBuilderProps } from "@/features/team/load";

const laura = users.find((u) => u.role === "staffing_lead")!;
const ana = users.find((u) => u.role === "engineer")!;
const rafael = users.find((u) => u.id === "u-rafael")!;
const admin = users.find((u) => u.role === "admin")!;

beforeEach(() => { resetMemoryStore(); state.persona = "staffing_lead"; });

describe("getTeamBuilderProps", () => {
  it("is for staffing leads only (the query is the protection, not the layout)", async () => {
    for (const u of [ana, rafael, admin]) await expect(getTeamBuilderProps(u, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getTeamBuilderProps(laura, {})).resolves.toBeTruthy();
  });

  it("selects the opportunity, names the real reviewer and keeps people minimal and free of private data", async () => {
    const p = await getTeamBuilderProps(laura, { opportunityId: "cobalt" });
    expect(p.initialOpportunityId).toBe("cobalt");
    const cobalt = p.opportunities.find((o) => o.id === "cobalt")!;
    expect(cobalt).toMatchObject({ deliveryLead: "Inés Vidal", deliveryLeadId: "u-ines" });
    expect(p.base.candidates.length).toBe(12);
    for (const c of p.base.candidates) expect(Object.keys(c).sort()).toEqual(["availability", "discipline", "evidence", "headline", "name", "personId"]);
    const json = JSON.stringify(p);
    expect(json).not.toMatch(/workPreferences|careerInterests|"interests":\{|passportGroups/);
  });
});

describe("save → submit round trip with the real actions", () => {
  it("composes from the role requirements, saves a draft, sends it, and the reopened proposal is read-only", async () => {
    const props = await getTeamBuilderProps(laura, { opportunityId: "cobalt" });
    const cobalt = props.opportunities.find((o) => o.id === "cobalt")!;
    const seats = composeSeats(cobalt).map((s, i) => (i === 0 ? { ...s, personId: "ana" } : s));
    const saved = await saveProposalAction({ opportunityId: "cobalt", title: "Cobalt Mobility team", brief: cobalt.description, noteForReviewer: "", seats: toSaveSeats(seats) });
    expect(saved).toMatchObject({ ok: true, proposal: { state: "draft", opportunityId: "cobalt" } });
    if (!saved.ok) throw new Error("save failed");
    expect(seatsFromProposal(saved.proposal).map((s) => [s.title, s.personId, s.confirmed])).toEqual([["iOS Engineer", "ana", false], ["Android Engineer", null, false], ["Mobile Tech Lead", null, false]]);

    const drafts = await getTeamBuilderProps(laura, {});
    expect(drafts.drafts).toEqual([{ id: saved.proposal.id, title: "Cobalt Mobility team", opportunityName: "Cobalt Mobility", state: "draft" }]);

    const sent = await submitProposalAction({ id: saved.proposal.id, note: "Ana is free before kick-off." });
    expect(sent).toMatchObject({ ok: true, proposal: { state: "submitted" } });

    const reopened = await getTeamBuilderProps(laura, { proposalId: saved.proposal.id });
    expect(reopened.proposal?.state).toBe("submitted");
    expect(isReadOnly(reopened.proposal!.state)).toBe(true);
    expect(reopened.initialOpportunityId).toBe("cobalt");
    expect(reopened.drafts).toEqual([]);                                       // no longer a draft
  });

  it("an engineer cannot save or send a proposal", async () => {
    state.persona = "engineer";
    const r = await saveProposalAction({ opportunityId: "cobalt", title: "x", brief: "", noteForReviewer: "", seats: [{ title: "iOS", capabilities: [], seniority: "Mid", allocation: 1, personId: null, roleRequirementId: null }] });
    expect(r.ok).toBe(false);
  });
});
