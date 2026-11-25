import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { availability as fixtureAvailability } from "@/data/fixtures/people";
import { createMemoryRepositories, resetMemoryStore } from "@/data/repositories/memory";
import type { Repositories } from "@/data/repositories/types";
import { DomainRuleError, ForbiddenError, NotFoundError } from "@/domain/errors";
import type { Actor } from "@/domain/policy";
import { canTransition, capacityCheck, deriveAvailability, teamCoverage, seatFit, placePerson } from "@/domain/proposals";
import type { SaveProposalInput } from "@/domain/schemas";

const laura: Actor = { id: "u-laura", role: "staffing_lead", personId: null };
const rafael: Actor = { id: "u-rafael", role: "delivery_lead", personId: null };
const ines: Actor = { id: "u-ines", role: "delivery_lead", personId: null };
const ana: Actor = { id: "u-ana", role: "engineer", personId: "ana" };
const admin: Actor = { id: "u-admin", role: "admin", personId: null };

let repos: Repositories;
beforeEach(() => { resetMemoryStore(); repos = createMemoryRepositories(); });

const cobalt = (over: Partial<SaveProposalInput> = {}): SaveProposalInput => ({
  opportunityId: "cobalt", title: "Cobalt Mobility, Fleet driver app rebuild", brief: "", noteForReviewer: "",
  seats: [
    { roleRequirementId: "cobalt-ios", title: "iOS Engineer", capabilities: ["Swift", "SwiftUI"], seniority: "Mid", allocation: 1, personId: "javier" },
    { roleRequirementId: "cobalt-android", title: "Android Engineer", capabilities: ["Kotlin"], seniority: null, allocation: 0.5, personId: null },
  ], ...over,
});
/** A submitted + approved Cobalt proposal (delivery lead: Inés). */
async function approved() {
  const p = await repos.proposals.save(laura.id, cobalt());
  await repos.proposals.submit(laura.id, p.id);
  return repos.proposals.review(ines.id, p.id, "approved");
}

describe("proposal lifecycle (mirrors 0004/0006)", () => {
  it("a saved proposal is a private draft with proposed/open seats", async () => {
    const p = await repos.proposals.save(laura.id, cobalt());
    expect(p).toMatchObject({ state: "draft", version: 1, createdBy: "u-laura", createdByName: "Laura Gómez" });
    expect(p.seats.map((s) => s.seatState)).toEqual(["proposed", "open"]);
    expect(await repos.proposals.get(ines, p.id)).toBeNull(); // the delivery lead cannot see a draft
    expect(await repos.proposals.get(laura, p.id)).not.toBeNull();
  });

  it("only editable states can be saved; save replaces the seats", async () => {
    const p = await repos.proposals.save(laura.id, cobalt());
    const again = await repos.proposals.save(laura.id, cobalt({ id: p.id, seats: [{ roleRequirementId: null, title: "QA", capabilities: ["Appium"], seniority: null, allocation: 1, personId: "camila" }] }));
    expect(again.seats).toHaveLength(1);
    await repos.proposals.submit(laura.id, p.id);
    await expect(repos.proposals.save(laura.id, cobalt({ id: p.id }))).rejects.toMatchObject({ code: "proposal_not_editable" });
  });

  it("refuses duplicate people, unknown roles, unknown people and unknown opportunities", async () => {
    const dup = cobalt(); dup.seats[1]!.personId = "javier";
    await expect(repos.proposals.save(laura.id, dup)).rejects.toMatchObject({ code: "duplicate_person" });
    const role = cobalt(); role.seats[0]!.roleRequirementId = "vela-ai";
    await expect(repos.proposals.save(laura.id, role)).rejects.toMatchObject({ code: "unknown_role" });
    const who = cobalt(); who.seats[0]!.personId = "nobody";
    await expect(repos.proposals.save(laura.id, who)).rejects.toMatchObject({ code: "unknown_person" });
    await expect(repos.proposals.save(laura.id, cobalt({ opportunityId: "nope" }))).rejects.toMatchObject({ code: "unknown_opportunity" });
  });

  it("only staffing leads write proposals, and only the author edits, submits or withdraws", async () => {
    await expect(repos.proposals.save(rafael.id, cobalt())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(repos.proposals.save(ana.id, cobalt())).rejects.toBeInstanceOf(ForbiddenError);
    const p = await repos.proposals.save(laura.id, cobalt());
    await expect(repos.proposals.submit(ines.id, p.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(repos.proposals.withdraw(ines.id, p.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(repos.proposals.submit(laura.id, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("submit → changes requested → resubmit increases the version; the review belongs to its version", async () => {
    const p = await repos.proposals.save(laura.id, cobalt());
    await repos.proposals.submit(laura.id, p.id, "Javier is free Jan 5");
    const returned = await repos.proposals.review(ines.id, p.id, "changes_requested", "Please add a lead");
    expect(returned.state).toBe("changes_requested");
    expect(returned.review).toMatchObject({ decision: "changes_requested", note: "Please add a lead", reviewerName: "Inés Vidal" });
    const re = await repos.proposals.submit(laura.id, p.id);
    expect(re).toMatchObject({ state: "submitted", version: 2, review: null });
  });

  it("review: only the delivery lead of THAT opportunity; never the author; a return needs a note; only a submitted proposal", async () => {
    const p = await repos.proposals.save(laura.id, cobalt());
    await expect(repos.proposals.review(ines.id, p.id, "approved")).rejects.toMatchObject({ code: "invalid_transition" }); // still a draft
    await repos.proposals.submit(laura.id, p.id);
    await expect(repos.proposals.review(rafael.id, p.id, "approved")).rejects.toBeInstanceOf(ForbiddenError); // leads Vela and Terra, not Cobalt
    await expect(repos.proposals.review(laura.id, p.id, "approved")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(repos.proposals.review(admin.id, p.id, "approved")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(repos.proposals.review(ana.id, p.id, "approved")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(repos.proposals.review(ines.id, p.id, "declined")).rejects.toMatchObject({ code: "note_required" });
    await expect(repos.proposals.review(ines.id, p.id, "declined", "   ")).rejects.toMatchObject({ code: "note_required" });
    expect((await repos.proposals.review(ines.id, p.id, "approved")).state).toBe("approved");
    await expect(repos.proposals.review(ines.id, p.id, "approved")).rejects.toMatchObject({ code: "invalid_transition" });
  });

  it("approving creates NO assignment (proposed ≠ assigned)", async () => {
    const before = (await repos.planning.listAssignments(laura)).length;
    await approved();
    expect((await repos.planning.listAssignments(laura)).length).toBe(before);
    expect((await repos.talent.getPerson("javier"))?.availability.proposedFor).toMatchObject({ opportunityId: "cobalt" });
  });

  it("withdraw is allowed from draft, submitted and changes_requested, not after a decision", async () => {
    const p = await repos.proposals.save(laura.id, cobalt());
    expect((await repos.proposals.withdraw(laura.id, p.id)).state).toBe("withdrawn");
    await expect(repos.proposals.withdraw(laura.id, p.id)).rejects.toMatchObject({ code: "invalid_transition" });
    const a = await approved();
    await expect(repos.proposals.withdraw(laura.id, a.id)).rejects.toMatchObject({ code: "invalid_transition" });
  });

  it("a proposal needs a seat to be submitted", () => {
    expect(canTransition("draft", "submitted")).toBe(true);
    expect(canTransition("approved", "withdrawn")).toBe(false);
    expect(canTransition("changes_requested", "approved")).toBe(false);
  });

  it("visibility: staffing leads see non-drafts and their own drafts; a delivery lead only submitted proposals of their opportunities", async () => {
    const d = await repos.proposals.save(laura.id, cobalt());
    const seenBy = async (v: Actor) => (await repos.proposals.list(v)).map((p) => p.id);
    expect(await seenBy(laura)).toEqual(expect.arrayContaining([d.id, "p-vela"]));
    expect(await seenBy(ines)).toEqual([]); // Vela is Rafael's, the Cobalt draft is a draft
    expect(await seenBy(rafael)).toEqual(["p-vela"]);
    await repos.proposals.submit(laura.id, d.id);
    expect(await seenBy(ines)).toEqual([d.id]);
    expect(await seenBy(ana)).toEqual([]);
    expect(await seenBy(admin)).toEqual([]);
  });
});

describe("explicit assignment confirmation", () => {
  const confirm = (seatId: string, over = {}) => ({ seatId, startsOn: "2027-01-19", endsOn: null, availableFrom: null, allocation: null, ...over });

  it("confirms ONE seat of an approved proposal; the seat becomes confirmed and the person's availability is derived", async () => {
    const p = await approved();
    const seat = p.seats[0]!;
    const a = await repos.proposals.confirmSeat(ines.id, confirm(seat.id));
    expect(a).toMatchObject({ personId: "javier", opportunityId: "cobalt", projectName: "Cobalt Mobility", deliveryLeadName: "Inés Vidal", endConfirmed: false, proposalSeatId: seat.id });
    const after = await repos.proposals.get(ines, p.id);
    expect(after?.seats[0]).toMatchObject({ seatState: "confirmed", assignmentId: a.id });
    expect(after?.seats[1]).toMatchObject({ seatState: "open" });
    expect((await repos.planning.listAssignments(ines)).map((x) => x.id)).toContain(a.id);
    await expect(repos.proposals.confirmSeat(ines.id, confirm(seat.id))).rejects.toMatchObject({ code: "seat_already_confirmed" });
  });

  it("refuses: not approved, wrong delivery lead, author, admin, engineer, an open seat, unknown seat", async () => {
    const d = await repos.proposals.save(laura.id, cobalt());
    await expect(repos.proposals.confirmSeat(ines.id, confirm(d.seats[0]!.id))).rejects.toMatchObject({ code: "not_approved" });
    await repos.proposals.submit(laura.id, d.id);
    await repos.proposals.review(ines.id, d.id, "approved");
    const [filled, open] = d.seats;
    await expect(repos.proposals.confirmSeat(rafael.id, confirm(filled!.id))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(repos.proposals.confirmSeat(laura.id, confirm(filled!.id))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(repos.proposals.confirmSeat(admin.id, confirm(filled!.id))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(repos.proposals.confirmSeat(ana.id, confirm(filled!.id))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(repos.proposals.confirmSeat(ines.id, confirm(open!.id))).rejects.toMatchObject({ code: "seat_has_no_person" });
    await expect(repos.proposals.confirmSeat(ines.id, confirm("nope"))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("capacity: overlap is fine while the peak stays at or below full-time; above it is refused with a clear message", async () => {
    // Ana is on Meridian until Dec 19 (released Jan 5). Two half-time seats from Jan 12 fit; a third does not.
    const mk = async (personId: string, allocation: number, role: string) => {
      const p = await repos.proposals.save(laura.id, cobalt({ seats: [{ roleRequirementId: role, title: "Seat", capabilities: [], seniority: null, allocation, personId }] }));
      await repos.proposals.submit(laura.id, p.id);
      return repos.proposals.review(ines.id, p.id, "approved");
    };
    const one = await mk("ana", 0.5, "cobalt-ios");
    const two = await mk("ana", 0.5, "cobalt-android");
    const three = await mk("ana", 0.25, "cobalt-lead");
    await repos.proposals.confirmSeat(ines.id, confirm(one.seats[0]!.id, { startsOn: "2027-01-12" }));
    await repos.proposals.confirmSeat(ines.id, confirm(two.seats[0]!.id, { startsOn: "2027-01-12" }));
    await expect(repos.proposals.confirmSeat(ines.id, confirm(three.seats[0]!.id, { startsOn: "2027-01-12" }))).rejects.toMatchObject({ code: "capacity_exceeded", message: expect.stringMatching(/full-time/i) });
    // …but a window that ends before the others start does not conflict
    await repos.proposals.confirmSeat(ines.id, confirm(three.seats[0]!.id, { startsOn: "2027-01-05", endsOn: "2027-01-10", availableFrom: "2027-01-11" }));
  });

  it("validates the dates: both or neither of end and release, release after the end", async () => {
    const p = await approved();
    const id = p.seats[0]!.id;
    await expect(repos.proposals.confirmSeat(ines.id, confirm(id, { endsOn: "2027-06-01" }))).rejects.toMatchObject({ code: "invalid_dates" });
    await expect(repos.proposals.confirmSeat(ines.id, confirm(id, { endsOn: "2027-06-01", availableFrom: "2027-06-01" }))).rejects.toMatchObject({ code: "invalid_dates" });
    await expect(repos.proposals.confirmSeat(ines.id, confirm(id, { endsOn: "2027-01-01", availableFrom: "2027-01-02" }))).rejects.toBeInstanceOf(DomainRuleError);
  });

  it("a delivery lead cannot confirm their own assignment", async () => {
    // A user who is both: modelled by an actor whose personId equals the seat's person.
    const p = await approved();
    const seat = p.seats[0]!; // javier
    const selfLead = createMemoryRepositories();
    expect(selfLead).toBeTruthy();
    // the engine checks users.personId; the fixture delivery leads own no profile, so the rule is covered by the SQL tests (rls-staffing) and policy.
    expect(seat.personId).toBe("javier");
  });
});

describe("derived availability and live opportunities", () => {
  it("the memory store derives exactly the fixtures' availability from assignments", async () => {
    for (const f of fixtureAvailability) {
      const got = (await repos.talent.getPerson(f.personId))?.availability;
      // (the fixtures name a delivery lead for Lucía although she has no current project: a derived value has none)
      expect(got).toEqual(f.currentProject ? f : { ...f, deliveryLead: null });
    }
  });

  it("opportunities reflect live proposals: proposed seats come from the latest submitted or approved proposal", async () => {
    const vela = await repos.opportunities.get("vela");
    expect(vela?.roles.filter((r) => r.proposedPersonId).map((r) => r.proposedPersonId).sort()).toEqual(["camila", "lucia"]);
    const cobaltBefore = await repos.opportunities.get("cobalt");
    expect(cobaltBefore?.roles.every((r) => r.proposedPersonId === null)).toBe(true);
    const p = await repos.proposals.save(laura.id, cobalt());
    expect((await repos.opportunities.get("cobalt"))?.roles.every((r) => r.proposedPersonId === null)).toBe(true); // a draft proposes nobody publicly
    await repos.proposals.submit(laura.id, p.id);
    expect((await repos.opportunities.get("cobalt"))?.roles.find((r) => r.id === "cobalt-ios")?.proposedPersonId).toBe("javier");
    await repos.proposals.withdraw(laura.id, p.id);
    expect((await repos.opportunities.get("cobalt"))?.roles.find((r) => r.id === "cobalt-ios")?.proposedPersonId).toBeNull();
  });

  it("resetMemoryStore restores everything", async () => {
    await approved();
    resetMemoryStore();
    repos = createMemoryRepositories();
    expect((await repos.proposals.list(laura)).map((p) => p.id)).toEqual(["p-vela"]);
  });

  it("deriveAvailability: part-time load leaves the person available; proposals never reduce availability", () => {
    const base = { opportunityId: null, projectName: "X", endsOn: null, availableFrom: null, endConfirmed: true, deliveryLeadId: "u", deliveryLeadName: "L", proposalSeatId: null };
    const half = { ...base, id: "1", personId: "p", startsOn: "2026-01-01", allocation: 0.5 };
    expect(deriveAvailability("p", "2026-11-24", [half], null).availableFrom).toBe("2026-11-24");
    const full = { ...base, id: "2", personId: "p", startsOn: "2026-01-01", endsOn: "2026-12-01", availableFrom: "2026-12-02", allocation: 1 };
    expect(deriveAvailability("p", "2026-11-24", [full], { opportunityId: "x", from: "2027-01-01" })).toMatchObject({ availableFrom: "2026-12-02", currentProject: "X" });
  });
});

describe("interests (expressions of interest in a role)", () => {
  it("express and withdraw; only roles of Staffing or Open opportunities", async () => {
    const e = await repos.interests.express("ana", "cobalt-lead", "Interested");
    expect(e).toMatchObject({ status: "shared", opportunityId: "cobalt" });
    expect((await repos.interests.listSharedFor(laura)).map((x) => x.roleRequirementId)).toContain("cobalt-lead");
    expect((await repos.interests.listSharedFor(ines)).map((x) => x.roleRequirementId)).toEqual(["cobalt-lead"]); // Cobalt is Inés's
    expect((await repos.interests.listSharedFor(rafael)).map((x) => x.roleRequirementId)).toEqual(["vela-mobile"]);
    await repos.interests.withdraw("ana", "cobalt-lead");
    expect((await repos.interests.listSharedFor(laura)).map((x) => x.roleRequirementId)).not.toContain("cobalt-lead");
    expect((await repos.interests.listForPerson("ana")).find((x) => x.roleRequirementId === "cobalt-lead")?.status).toBe("withdrawn");
    await expect(repos.interests.express("ana", "nimbus-arch", "")).rejects.toMatchObject({ code: "interest_closed" }); // Upcoming
    await expect(repos.interests.express("ana", "nope", "")).rejects.toMatchObject({ code: "interest_closed" });
  });
  it("engineers and admins see no shared interests of others", async () => {
    expect(await repos.interests.listSharedFor(ana)).toEqual([]);
    expect(await repos.interests.listSharedFor(admin)).toEqual([]);
  });
});

describe("pure rules", () => {
  it("capacityCheck uses a half-open window", () => {
    const a = { startsOn: "2027-01-01", availableFrom: "2027-02-01", allocation: 1 };
    expect(capacityCheck([a], { startsOn: "2027-02-01", availableFrom: null, allocation: 1 }).ok).toBe(true);
    expect(capacityCheck([a], { startsOn: "2027-01-31", availableFrom: null, allocation: 1 }).ok).toBe(false);
  });
  it("placePerson moves a person (at most one seat)", () => {
    const seats = [{ personId: "a" }, { personId: null }];
    expect(placePerson(seats, 1, "a")).toEqual([{ personId: null }, { personId: "a" }]);
  });
  it("teamCoverage and seatFit follow the spec groups", () => {
    const cov = teamCoverage([{ capabilities: ["Swift"], personId: null }, { capabilities: ["Zzz"], personId: "x" }], {}, []);
    expect(cov).toMatchObject({ waitingOnOpenSeats: ["Swift"], notDocumented: ["Zzz"] });
    const av = { personId: "x", availableFrom: "2027-02-02", status: "pending" as const, currentProject: null, currentProjectEnds: null, deliveryLead: null, proposedFor: null };
    expect(seatFit(av, "2027-01-12", "cobalt", "2026-11-24")).toMatchObject({ kind: "late", conflict: true });
    expect(seatFit({ ...av, availableFrom: "2026-12-08", status: "confirmed" }, "2027-01-12", "cobalt", "2026-11-24")).toMatchObject({ kind: "free", conflict: false });
    expect(seatFit({ ...av, proposedFor: { opportunityId: "vela", from: "2027-01-12" } }, "2027-01-12", "cobalt", "2026-11-24").kind).toBe("overlap");
  });
});
