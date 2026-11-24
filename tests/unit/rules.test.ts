import { describe, expect, it } from "vitest";
import { capabilities } from "@/data/fixtures/capabilities";
import { availability, evidence, people } from "@/data/fixtures/people";
import { opportunities } from "@/data/fixtures/organization";
import { describeAvailability, freeWithin, interpretQuery, levelFor, matchPeople, requirementSummary, seatCounts, seatsLabel, groupPassportSkills, applyPeopleFilters } from "@/domain/rules";
import { formatShortDate, formatWeekdayDate } from "@/domain/dates";

const TODAY = "2026-11-24";
const rows = people.map((person) => ({
  person,
  evidence: evidence.filter((e) => e.personId === person.id),
  availability: availability.find((a) => a.personId === person.id)!,
}));
const row = (id: string) => rows.find((r) => r.person.id === id)!;

describe("dates", () => {
  it("formats business dates without timezone drift", () => {
    expect(formatShortDate("2027-01-05")).toBe("Jan 5");
    expect(formatWeekdayDate(TODAY)).toBe("Tuesday, November 24");
  });
});

describe("availability", () => {
  it("labels people free today as available now", () => {
    expect(describeAvailability(row("lucia").availability, TODAY).text).toBe("Available now");
  });
  it("labels future availability with its date and confirmation status", () => {
    const v = describeAvailability(row("daniel").availability, TODAY);
    expect(v.text).toBe("Available from Feb 2");
    expect(v.statusLabel).toBe("Pending confirmation");
  });
  it("finds the 6 people free within 60 days, soonest first (matches the approved Home)", () => {
    const ids = freeWithin(rows, TODAY, 60).map((r) => r.person.id);
    expect(ids).toEqual(["lucia", "camila", "sofia", "ana", "javier", "ethan"]);
  });
});

describe("plain-language search", () => {
  it("interprets React Native and native iOS", () => {
    expect(interpretQuery("Engineers with React Native and native iOS experience", capabilities).map((c) => c.id)).toEqual(["react-native", "ios"]);
  });
  it("does not confuse 'react native' with 'react'", () => {
    expect(interpretQuery("react native", capabilities).map((c) => c.id)).toEqual(["react-native"]);
  });
  it("returns nothing for unknown text", () => {
    expect(interpretQuery("xyz", capabilities)).toEqual([]);
  });
  it("orders by documented professional matches, then availability, and excludes people with no match", () => {
    const caps = interpretQuery("React Native and native iOS", capabilities);
    const res = matchPeople(caps, rows);
    expect(res.map((r) => r.personId)).toEqual(["ana", "javier", "ethan", "mateo", "sofia"]);
    expect(res[0]!.matches.every((m) => m.level === "professional")).toBe(true);
  });
  it("never exposes a numeric score", () => {
    const res = matchPeople(interpretQuery("AWS", capabilities), rows);
    for (const r of res) expect(Object.keys(r).sort()).toEqual(["matches", "personId"]);
  });
  it("uses the strongest evidence level when several exist", () => {
    expect(levelFor(row("ana").evidence, "llm-apps")).toBe("independent");
  });
});

describe("filters", () => {
  it("filters by discipline and availability cut-off", () => {
    const res = applyPeopleFilters(rows, { discipline: "Mobile", availableBy: "2027-01-31" }).map((r) => r.person.id);
    expect(res.sort()).toEqual(["ana", "ethan", "javier"]);
  });
});

describe("opportunities", () => {
  const vela = opportunities.find((o) => o.id === "vela")!;
  it("counts seats from proposals (proposed is not assigned)", () => {
    expect(seatCounts(vela)).toEqual({ total: 4, proposed: 2, open: 2 });
    expect(seatsLabel(vela)).toBe("2 of 4 seats proposed");
  });
  it("totals 10 open seats across the dataset (matches the approved Home)", () => {
    expect(opportunities.reduce((n, o) => n + seatCounts(o).open, 0)).toBe(10);
  });
  it("summarizes requirements deterministically", () => {
    expect(requirementSummary(vela, "6 months", "Jan 12")[0]).toBe("4 roles, 2 still open");
  });
});

describe("passport grouping", () => {
  it("respects the person's own grouping (Ana: 3 groups as in V4.2)", () => {
    const g = groupPassportSkills(row("ana").person, row("ana").evidence, capabilities);
    expect(g.map((x) => x.title)).toEqual(["Mobile engineering", "Web & APIs", "Applied AI"]);
    expect(g.reduce((n, x) => n + x.skills.length, 0)).toBe(row("ana").evidence.length);
  });
  it("derives groups from the catalogue otherwise", () => {
    expect(groupPassportSkills(row("marcus").person, row("marcus").evidence, capabilities).map((x) => x.title)).toEqual(["Cloud & platform", "Architecture"]);
  });
});

describe("dataset integrity", () => {
  it("every person has availability and every evidence row references a known person", () => {
    for (const p of people) expect(availability.some((a) => a.personId === p.id)).toBe(true);
    for (const e of evidence) expect(people.some((p) => p.id === e.personId)).toBe(true);
  });
  it("every evidence capability exists in the catalogue", () => {
    for (const e of evidence) expect(capabilities.some((c) => c.id === e.capabilityId)).toBe(true);
  });
  it("proposed people exist", () => {
    for (const o of opportunities) for (const r of o.roles) if (r.proposedPersonId) expect(people.some((p) => p.id === r.proposedPersonId)).toBe(true);
  });
});
