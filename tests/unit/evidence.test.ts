/**
 * Evidence model: SOURCE (professional / independent / training / emerging) and VERIFICATION
 * (self_reported / pending / verified) are separate concepts. These tests pin the business rules.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { capabilities } from "@/data/fixtures/capabilities";
import { availability, evidence, people, projects } from "@/data/fixtures/people";
import { createMemoryRepositories, resetMemoryStore } from "@/data/repositories/memory";
import { DomainRuleError } from "@/domain/errors";
import {
  bestEvidence, canOwnerAddEvidence, canOwnerRemoveEvidence, describeEvidence, evidenceBasis, interpretQuery, levelFor, matchFor, matchPeople, projectVerificationText,
} from "@/domain/rules";
import { AddSkillInput, SkillEvidence, type EvidenceLevel, type Verification } from "@/domain/schemas";

const cap = (id: string) => capabilities.find((c) => c.id === id)!;
let seq = 0;
const row = (capabilityId: string, level: EvidenceLevel, verification: Verification, personId = "p"): SkillEvidence => ({ id: `e${seq++}`, personId, capabilityId, label: capabilityId, level, detail: "", verification });
const person = (id: string, ev: SkillEvidence[], availableFrom = "2027-01-05") => ({
  person: { ...people[0]!, id, name: id }, evidence: ev.map((e) => ({ ...e, personId: id })), availability: { ...availability[0]!, personId: id, availableFrom },
});

describe("source and verification are independent", () => {
  it("every skill and project in the fictional dataset carries an explicit verification status", () => {
    for (const e of evidence) expect(["self_reported", "pending", "verified"]).toContain(e.verification);
    for (const p of projects) expect(["self_reported", "pending", "verified"]).toContain(p.verification);
    expect(evidence.some((e) => e.verification === "pending")).toBe(true); // all three states are represented
  });
  it("the old overloaded fields are gone: no `selfReported`, no free-text project `source`", () => {
    for (const e of evidence) expect(e).not.toHaveProperty("selfReported");
    for (const p of projects) expect(p).not.toHaveProperty("source");
  });
  it("a verified row names who confirmed it and when; unverified rows carry no verification stamp", () => {
    for (const e of evidence) {
      if (e.verification === "verified") { expect(e.verifiedBy).toBeTruthy(); expect(e.verifiedOn).toBeTruthy(); }
      else { expect(e.verifiedBy).toBeUndefined(); expect(e.verifiedOn).toBeUndefined(); }
    }
  });
  it("source does not imply verification: independent and training rows exist in both states", () => {
    expect(evidence.some((e) => e.level === "independent" && e.verification === "self_reported")).toBe(true);
    expect(evidence.some((e) => e.level === "training" && e.verification === "verified")).toBe(true); // a certification
    expect(evidence.some((e) => e.level === "professional" && e.verification === "verified")).toBe(true);
  });
  it("a row with no explicit verification defaults to the safe value, self-reported", () => {
    expect(SkillEvidence.parse({ id: "x", personId: "p", capabilityId: "aws", label: "AWS", level: "professional", detail: "" }).verification).toBe("self_reported");
  });
  it("evidence basis: practical + verified is its own class; unconfirmed practical and learning follow", () => {
    expect(evidenceBasis({ level: "professional", verification: "verified" })).toBe("verified_practical");
    expect(evidenceBasis({ level: "independent", verification: "verified" })).toBe("verified_practical");
    expect(evidenceBasis({ level: "professional", verification: "self_reported" })).toBe("unverified_practical");
    expect(evidenceBasis({ level: "independent", verification: "pending" })).toBe("unverified_practical");
    expect(evidenceBasis({ level: "training", verification: "verified" })).toBe("learning");
    expect(evidenceBasis({ level: "emerging", verification: "self_reported" })).toBe("learning");
  });
  it("`levelFor` still reports the strongest SOURCE (it never looks at verification)", () => {
    expect(levelFor([row("aws", "training", "verified"), row("aws", "independent", "self_reported")], "aws")).toBe("independent");
  });
});

describe("describing evidence: missing is 'not documented', never a confirmed absence", () => {
  it("labels source and verification, and flags what needs confirmation", () => {
    expect(describeEvidence("professional", "verified")).toEqual({ text: "professional · verified", needsConfirmation: false });
    expect(describeEvidence("independent", "self_reported")).toEqual({ text: "independent · self-reported (needs confirmation)", needsConfirmation: true });
    expect(describeEvidence("professional", "pending")).toEqual({ text: "professional · pending verification (needs confirmation)", needsConfirmation: true });
  });
  it("no evidence is 'not documented' and does not 'need confirmation'", () => {
    expect(describeEvidence(null, null)).toEqual({ text: "not documented", needsConfirmation: false });
    const m = matchFor([], cap("aws"));
    expect(m).toEqual({ capabilityId: "aws", name: "AWS", level: null, verification: null, needsConfirmation: false });
  });
  it("project verification text separates confirmation from the person's own claim", () => {
    expect(projectVerificationText({ verification: "verified", verifiedBy: "Rafael Ortiz, delivery lead", verifiedOn: "2026-11" })).toBe("Confirmed by Rafael Ortiz, delivery lead · Nov 2026");
    expect(projectVerificationText({ verification: "verified", verifiedBy: "Inés Vidal, delivery lead" })).toBe("Confirmed by Inés Vidal, delivery lead");
    expect(projectVerificationText({ verification: "self_reported" })).toMatch(/^Self-reported/);
    expect(projectVerificationText({ verification: "pending" })).toMatch(/pending/i);
  });
});

describe("evidence-aware matching", () => {
  const sofiaStyle = (id: string, ev: SkillEvidence[], when?: string) => person(id, ev, when);

  it("verified professional experience comes before the same experience when self-reported, whatever the availability", () => {
    const rows = [
      sofiaStyle("self", [row("react-native", "professional", "self_reported")], "2026-12-01"), // available EARLIER
      sofiaStyle("verified", [row("react-native", "professional", "verified")], "2027-02-01"),
    ];
    expect(matchPeople([cap("react-native")], rows).map((m) => m.personId)).toEqual(["verified", "self"]);
  });

  it("the self-reported person is still found, and their match is marked as needing confirmation", () => {
    const rows = [sofiaStyle("self", [row("react-native", "professional", "self_reported")])];
    const [m] = matchPeople([cap("react-native")], rows);
    expect(m!.matches[0]).toMatchObject({ level: "professional", verification: "self_reported", needsConfirmation: true });
  });

  it("independent experience stays discoverable: verified independent beats unverified professional, and unverified independent beats verified training", () => {
    const rows = [
      sofiaStyle("pro-self", [row("aws", "professional", "self_reported")]),
      sofiaStyle("indep-verified", [row("aws", "independent", "verified")]),
      sofiaStyle("training-verified", [row("aws", "training", "verified")]),
      sofiaStyle("indep-self", [row("aws", "independent", "self_reported")]),
    ];
    expect(matchPeople([cap("aws")], rows).map((m) => m.personId)).toEqual(["indep-verified", "pro-self", "indep-self", "training-verified"]);
  });

  it("among equally verified evidence, professional work comes before independent work", () => {
    const rows = [sofiaStyle("indep", [row("aws", "independent", "verified")], "2026-12-01"), sofiaStyle("pro", [row("aws", "professional", "verified")], "2027-02-01")];
    expect(matchPeople([cap("aws")], rows).map((m) => m.personId)).toEqual(["pro", "indep"]);
  });

  it("ordering is requirement-specific: it counts only the REQUESTED capabilities", () => {
    const rows = [
      sofiaStyle("a", [row("aws", "professional", "verified"), row("python", "professional", "verified"), row("go", "professional", "verified")]),
      sofiaStyle("b", [row("aws", "professional", "verified")]),
    ];
    // Asking only for AWS: a and b are equal on evidence (a's other skills are irrelevant), so availability decides, then input order is irrelevant.
    expect(matchPeople([cap("aws")], rows.map((r) => ({ ...r, availability: { ...r.availability, availableFrom: r.person.id === "b" ? "2026-12-01" : "2027-01-05" } }))).map((m) => m.personId)).toEqual(["b", "a"]);
    // Asking for AWS and Python: a covers both, so a comes first.
    expect(matchPeople([cap("aws"), cap("python")], rows).map((m) => m.personId)).toEqual(["a", "b"]);
  });

  it("a best-evidence row is chosen by verification first within the same source", () => {
    const ev = [row("aws", "professional", "self_reported"), row("aws", "professional", "verified")];
    expect(bestEvidence(ev, "aws")!.verification).toBe("verified");
  });

  it("never exposes a score or rank: result and match keys are exactly the documented ones", () => {
    const rows = [sofiaStyle("x", [row("aws", "professional", "verified")])];
    const [m] = matchPeople([cap("aws")], rows);
    expect(Object.keys(m!).sort()).toEqual(["matches", "personId"]);
    expect(Object.keys(m!.matches[0]!).sort()).toEqual(["capabilityId", "level", "name", "needsConfirmation", "verification"]);
  });

  it("is deterministic: the same input in any input order gives the same result", () => {
    const rows = [
      sofiaStyle("a", [row("aws", "professional", "verified")]), sofiaStyle("b", [row("aws", "independent", "self_reported")]),
      sofiaStyle("c", [row("aws", "training", "verified")]), sofiaStyle("d", [row("aws", "professional", "pending")]),
    ];
    const order = (rs: typeof rows) => matchPeople([cap("aws")], rs).map((m) => m.personId);
    const base = order(rows);
    expect(order([...rows].reverse())).toEqual(base);
    expect(order([rows[2]!, rows[0]!, rows[3]!, rows[1]!])).toEqual(base);
    expect(base).toEqual(["a", "d", "b", "c"]);
  });

  it("legitimate search over the fictional dataset keeps working and reports each person's basis", () => {
    const all = people.map((p) => ({ person: p, evidence: evidence.filter((e) => e.personId === p.id), availability: availability.find((a) => a.personId === p.id)! }));
    const res = matchPeople(interpretQuery("React Native and native iOS", capabilities), all);
    expect(res.map((r) => r.personId)).toEqual(["ana", "javier", "ethan", "mateo", "sofia"]);
    const mateo = res.find((r) => r.personId === "mateo")!;
    expect(mateo.matches.find((m) => m.capabilityId === "react-native")).toMatchObject({ level: "independent", verification: "pending", needsConfirmation: true });
    expect(mateo.matches.find((m) => m.capabilityId === "ios")).toMatchObject({ level: null, verification: null, needsConfirmation: false }); // not documented
  });
});

describe("owner mutation rules (domain)", () => {
  it("an owner can withdraw self-reported and pending claims, never verified evidence", () => {
    expect(canOwnerRemoveEvidence({ verification: "self_reported", label: "x" })).toEqual({ allowed: true });
    expect(canOwnerRemoveEvidence({ verification: "pending", label: "x" })).toEqual({ allowed: true });
    expect(canOwnerRemoveEvidence({ verification: "verified", label: "React Native" })).toMatchObject({ allowed: false, code: "evidence_locked", reason: expect.stringContaining("verified") });
  });
  it("exact duplicates (same label, capability and source) are refused", () => {
    const existing = [{ capabilityId: "aws", level: "independent" as const, label: "AWS" }];
    expect(canOwnerAddEvidence(existing, { capabilityId: "aws", level: "independent", label: "aws " })).toMatchObject({ allowed: false, code: "duplicate_evidence" });
    expect(canOwnerAddEvidence(existing, { capabilityId: "aws", level: "professional", label: "AWS" })).toEqual({ allowed: true }); // other source
  });
  it("a different label for the same capability is a different claim and is allowed (matching uses the best evidence, so nothing is double counted)", () => {
    const existing = [{ capabilityId: "ondevice-ml", level: "professional" as const, label: "On-device text recognition" }];
    expect(canOwnerAddEvidence(existing, { capabilityId: "ondevice-ml", level: "professional", label: "Core ML" })).toEqual({ allowed: true });
  });
});

describe("owner mutations through the repository", () => {
  beforeEach(() => resetMemoryStore());
  const repo = () => createMemoryRepositories().talent;
  const evidenceOf = async (id: string) => (await repo().getPerson(id))!.evidence;

  it("whatever source the owner declares, a new row is self-reported with no verification stamp", async () => {
    const r = await repo().addSkill("ana", { label: "Terraform", level: "professional" });
    expect(r).toMatchObject({ level: "professional", verification: "self_reported" });
    expect(r.verifiedBy).toBeUndefined();
    expect(r.verifiedOn).toBeUndefined();
  });
  it("verification cannot be smuggled in through the input: the schema rejects it", () => {
    expect(AddSkillInput.safeParse({ label: "Terraform", level: "professional", verification: "verified" }).success).toBe(false);
    expect(AddSkillInput.safeParse({ label: "Terraform", level: "professional", verifiedBy: "me" }).success).toBe(false);
    expect(AddSkillInput.safeParse({ label: "Terraform", level: "professional" }).success).toBe(true);
  });
  it("duplicate evidence is refused with a typed rule error", async () => {
    await expect(repo().addSkill("ana", { label: "Kotlin Multiplatform", level: "independent" })).rejects.toBeInstanceOf(DomainRuleError); // ana already has it
  });
  it("verified evidence cannot be removed, and nothing changes", async () => {
    const before = await evidenceOf("ana");
    const verified = before.find((e) => e.verification === "verified")!;
    await expect(repo().removeSkill("ana", verified.id)).rejects.toMatchObject({ code: "evidence_locked" });
    expect(await evidenceOf("ana")).toEqual(before);
    expect((await evidenceOf("ana")).find((e) => e.id === verified.id)).toEqual(verified); // history (verifiedBy/On) intact
  });
  it("self-reported and pending claims can be withdrawn; someone else's evidence cannot", async () => {
    const mine = (await evidenceOf("ana")).find((e) => e.verification === "self_reported")!;
    expect(await repo().removeSkill("ana", mine.id)).toBe(true);
    const mateoPending = (await evidenceOf("mateo")).find((e) => e.verification === "pending")!;
    expect(await repo().removeSkill("ana", mateoPending.id)).toBe(false); // not Ana's row
    expect((await evidenceOf("mateo")).some((e) => e.id === mateoPending.id)).toBe(true);
    expect(await repo().removeSkill("mateo", mateoPending.id)).toBe(true); // Mateo can withdraw his own pending request
  });
  it("a new project is self-reported too", async () => {
    const p = await repo().addProject("ana", { title: "Discovery sprint", role: "Advisor", what: "Ran a two week discovery sprint.", period: "Nov 2026" });
    expect(p.verification).toBe("self_reported");
    expect(p.verifiedBy).toBeUndefined();
  });
});
