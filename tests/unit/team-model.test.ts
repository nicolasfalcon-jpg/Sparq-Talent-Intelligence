import { describe, expect, it } from "vitest";
import { base, ctx, opportunity } from "./team-fixtures";
import {
  candidateViews, compareHref, composeSeats, conflictRows, coverageGroups, fitFor, inferSeniority, isReadOnly, openSeatsLabel, placeToast, reviewNotes, seatLayout, seatState,
  seatsFromProposal, summaryLine, timeline, toSaveSeats, type TeamSeat,
} from "@/features/team/model";
import { placePerson } from "@/domain/proposals";
import type { TeamProposal } from "@/domain/schemas";

const seats = (): TeamSeat[] => composeSeats(opportunity);

describe("composition (deterministic, from the role requirements)", () => {
  it("creates one OPEN seat per role requirement with an inferred level", () => {
    const s = seats();
    expect(s.map((x) => x.title)).toEqual(["iOS Engineer", "Senior Android Engineer", "QA Automation"]);
    expect(s.every((x) => x.personId === null && !x.confirmed && seatState(x) === "open")).toBe(true);
    expect(s.map((x) => x.seniority)).toEqual(["Mid", "Senior", "Mid"]);
    expect(s[0]!.roleRequirementId).toBe("kestrel-ios");
  });
  it("infers levels from the title", () => {
    expect(inferSeniority("Mobile Tech Lead")).toBe("Lead");
    expect(inferSeniority("Solutions Architect")).toBe("Senior");
    expect(inferSeniority("Data Engineer")).toBe("Mid");
  });
  it("only a server-confirmed seat is Confirmed (a placed person is Proposed)", () => {
    expect(seatState({ personId: "ana", confirmed: false })).toBe("proposed");
    expect(seatState({ personId: "ana", confirmed: true })).toBe("confirmed");
    expect(seatState({ personId: null, confirmed: true })).toBe("open");
  });
  it("round-trips a proposal into seats and back into a save payload (no state or verification fields)", () => {
    const p = { seats: [{ id: "s1", roleRequirementId: "kestrel-ios", title: "iOS Engineer", capabilities: ["Swift"], seniority: "Mid", allocation: 0.5, personId: "ana", seatState: "confirmed", assignmentId: "a1" }] } as TeamProposal;
    const s = seatsFromProposal(p);
    expect(s[0]).toMatchObject({ key: "s1", personId: "ana", confirmed: true, allocation: 0.5 });
    expect(Object.keys(toSaveSeats(s)[0]!).sort()).toEqual(["allocation", "capabilities", "personId", "roleRequirementId", "seniority", "title"]);
  });
});

describe("canvas layout", () => {
  it("places seats on an ellipse starting at 12 o'clock", () => {
    const l = seatLayout(4);
    expect(l[0]).toEqual({ x: 50, y: 18 });
    expect(l[1]!.x).toBeGreaterThan(80); expect(l[1]!.y).toBe(50);
    expect(l[2]).toEqual({ x: 50, y: 82 });
    expect(l[3]!.x).toBeLessThan(20);
  });
  it("keeps every slot inside the canvas for any supported team size", () => {
    for (let n = 1; n <= 12; n++) for (const s of seatLayout(n)) { expect(s.x).toBeGreaterThan(10); expect(s.x).toBeLessThan(90); expect(s.y).toBeGreaterThan(10); expect(s.y).toBeLessThan(90); }
  });
});

describe("a person occupies at most one seat", () => {
  it("moves a person instead of duplicating them", () => {
    const s = placePerson(placePerson(seats(), 0, "ana"), 1, "ana");
    expect(s.map((x) => x.personId)).toEqual([null, "ana", null]);
  });
});

describe("availability fit against kick-off (spec §9.5)", () => {
  it("free before kick-off, late+pending, and overlaps another team", () => {
    expect(fitFor(ctx, "ana")).toMatchObject({ kind: "free", conflict: false, text: "Free from Dec 1 · confirmed" });
    expect(fitFor(ctx, "ethan")).toMatchObject({ kind: "free", text: "Free now" });
    expect(fitFor(ctx, "javier")).toMatchObject({ kind: "late", conflict: true });
    expect(fitFor(ctx, "javier")!.text).toMatch(/after kick-off, pending/);
    expect(fitFor(ctx, "camila")).toMatchObject({ kind: "overlap", text: "Proposed for Vela Bank from Jan 12" });
  });
  it("lists every conflicting placed person and none of the free ones", () => {
    const s = placePerson(placePerson(placePerson(seats(), 0, "javier"), 1, "ana"), 2, "camila");
    expect(conflictRows(ctx, s).map((c) => [c.person, c.tone])).toEqual([["Javier Morales", "warn"], ["Camila Duarte", "overlap"]]);
    expect(conflictRows(ctx, seats())).toEqual([]);
  });
  it("labels open seats", () => {
    expect(openSeatsLabel(seats())).toBe("3 open seats");
    expect(openSeatsLabel(placePerson(seats().slice(0, 1), 0, "ana"))).toBe("All seats proposed");
  });
});

describe("candidates for a seat", () => {
  it("shows only people with documented experience, evidence-first, never a score", () => {
    const s = seats(); const { views } = candidateViews(ctx, s, s[0]!);
    expect(views.map((v) => v.personId)).toEqual(["ana", "javier"]);   // verified practical before self-reported; Ethan and Camila have no Swift
    expect(JSON.stringify(views)).not.toMatch(/score|rank/i);
    expect(views[1]!.cells[0]).toMatchObject({ label: "Swift", level: "professional", verification: "self_reported", needsConfirmation: true });
    expect(views[0]!.cells[1]).toMatchObject({ label: "WidgetKit", level: null, text: "not documented" });
  });
  it("reports requirement labels outside the catalogue as not documented", () => {
    const s = seats(); expect(candidateViews(ctx, s, s[0]!).uncatalogued).toEqual(["WidgetKit"]);
  });
  it("flags shortlist and shared interest, per seat", () => {
    const s = seats();
    expect(candidateViews(ctx, s, s[0]!).views.find((v) => v.personId === "javier")!.sharedInterest).toBe(true);
    expect(candidateViews(ctx, s, s[0]!).views.find((v) => v.personId === "ana")!.sharedInterest).toBe(false);
    const a = candidateViews(ctx, s, s[1]!); expect(a.views.find((v) => v.personId === "ethan")!.onShortlist).toBe(true);
  });
  it("action is propose / propose instead / move here / proposed (spec §9.4)", () => {
    let s = seats();
    expect(candidateViews(ctx, s, s[0]!).views[0]!.action).toBe("propose");
    s = placePerson(s, 0, "ana");
    expect(candidateViews(ctx, s, s[0]!).views.find((v) => v.personId === "ana")!.action).toBe("remove");
    expect(candidateViews(ctx, s, s[0]!).views.find((v) => v.personId === "javier")!.action).toBe("replace");
    const s2 = placePerson(seats(), 2, "ana");
    const swift = candidateViews(ctx, s2, s2[0]!).views.find((v) => v.personId === "ana")!;
    expect(swift).toMatchObject({ action: "move", actionLabel: "Move here", elsewhere: "QA Automation" });
  });
  it("toast copy", () => {
    expect(placeToast("propose", "Ana Ruiz", "iOS Engineer")).toBe("Ana Ruiz proposed for iOS Engineer");
    expect(placeToast("replace", "Javier Morales", "iOS Engineer", "Ana Ruiz")).toBe("Javier Morales replaces Ana Ruiz");
    expect(placeToast("remove", "Ana Ruiz", "iOS Engineer")).toBe("Ana Ruiz removed from iOS Engineer");
  });
  it("compare link: at most three people, holder first, with the opportunity and role", () => {
    const s = placePerson(seats(), 0, "javier"); const v = candidateViews(ctx, s, s[0]!).views;
    const href = compareHref(ctx, s[0]!, v);
    expect(href).toBe("/compare?ids=javier%2Cana&opp=kestrel&role=kestrel-ios");
    expect(decodeURIComponent(href.split("ids=")[1]!.split("&")[0]!).split(",").length).toBeLessThanOrEqual(3);
  });
});

describe("coverage (spec §9.6) uses documented capabilities and never turns missing evidence into 'no'", () => {
  it("groups capabilities by the best level among ALL placed people", () => {
    // Swift: Ana (professional); Appium: Camila (professional); Kotlin: only Camila's training counts, even though her seat is QA.
    const { coverage } = coverageGroups(ctx, placePerson(placePerson(seats(), 0, "ana"), 2, "camila"));
    expect(coverage.documented).toEqual(["Swift", "Appium"]);
    expect(coverage.trainingOrIndependent).toEqual(["Kotlin"]);
    expect(coverage.notDocumented).toEqual(["WidgetKit"]);              // belongs to a filled seat, nobody has it
    expect(coverage.waitingOnOpenSeats).toEqual([]);
  });
  it("capabilities that belong only to open seats are 'waiting', not 'not documented'", () => {
    const { coverage } = coverageGroups(ctx, placePerson(seats(), 0, "ana"));
    expect(coverage.waitingOnOpenSeats).toEqual(["Kotlin", "Appium"]);
    expect(coverage.notDocumented).toEqual(["WidgetKit"]);
  });
  it("training-only experience is its own group", () => {
    const { coverage } = coverageGroups(ctx, placePerson(seats(), 1, "camila"));
    expect(coverage.trainingOrIndependent).toEqual(["Kotlin"]);
  });
  it("flags documented-but-unconfirmed capabilities as needing confirmation (source ≠ verification)", () => {
    const g = coverageGroups(ctx, placePerson(seats(), 0, "javier")).groups.find((x) => x.key === "documented")!;
    expect(g.items).toEqual([{ label: "Swift", needsConfirmation: true }]);
    const g2 = coverageGroups(ctx, placePerson(seats(), 0, "ana")).groups.find((x) => x.key === "documented")!;
    expect(g2.items).toEqual([{ label: "Swift", needsConfirmation: false }]);
  });
  it("hides empty groups", () => { expect(coverageGroups(ctx, seats()).groups.map((g) => g.key)).toEqual(["waitingOnOpenSeats"]); });
});

describe("review notes, timeline and state", () => {
  it("lists open seats, conflicts and gaps; an empty list says 'Nothing pending'", () => {
    const s = placePerson(placePerson(seats(), 0, "javier"), 2, "camila");
    const n = reviewNotes(ctx, s);
    expect(n).toContain("Senior Android Engineer seat is still open");
    expect(n).toContain("Camila Duarte: proposed for Vela Bank from Jan 12");
    expect(n).toContain("Javier Morales starts after kick-off (Feb 2), and the date is not yet confirmed");
    expect(reviewNotes(ctx, [{ ...seats()[1]!, personId: "ethan" }])).toEqual(["Nothing pending"]);
  });
  it("timeline spans from this month past kick-off and marks kick-off inside it", () => {
    const t = timeline(ctx, placePerson(seats(), 0, "javier"));
    expect(t.ticks[0]!.label).toBe("Nov");
    expect(t.kickoffLeft).toBeGreaterThan(0); expect(t.kickoffLeft).toBeLessThan(100);
    expect(t.rows[0]).toMatchObject({ filled: true, tone: "warn" }); expect(t.rows[0]!.left).toBeGreaterThan(t.kickoffLeft);
    expect(t.rows[1]).toMatchObject({ filled: false, person: "Open seat" });
  });
  it("is read-only once sent, approved, declined or withdrawn; editable as draft or returned", () => {
    for (const s of ["submitted", "approved", "declined", "withdrawn"] as const) expect(isReadOnly(s)).toBe(true);
    for (const s of ["draft", "changes_requested", null] as const) expect(isReadOnly(s)).toBe(false);
  });
  it("summary line", () => { expect(summaryLine(base && ctx, placePerson(seats(), 0, "ana"))).toBe("3 roles · 1 placed · kick-off Jan 12"); });
});
