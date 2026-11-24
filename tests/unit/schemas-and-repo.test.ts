import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { capabilities } from "@/data/fixtures/capabilities";
import { availability, evidence, people, projects } from "@/data/fixtures/people";
import { opportunities } from "@/data/fixtures/organization";
import { createMemoryRepositories, resetMemoryStore } from "@/data/repositories/memory";
import { AssistantRequest, Availability, Capability, Opportunity, Person, ProjectExperience, SkillEvidence, UpdateSummaryInput } from "@/domain/schemas";
import { RuleBasedAssistant } from "@/features/ask-sparq/gateway";

describe("fixtures satisfy the domain contracts", () => {
  it.each([
    ["people", Person, people], ["evidence", SkillEvidence, evidence], ["projects", ProjectExperience, projects],
    ["availability", Availability, availability], ["opportunities", Opportunity, opportunities], ["capabilities", Capability, capabilities],
  ] as const)("%s", (_n, schema, rows) => {
    for (const r of rows) expect(() => schema.parse(r)).not.toThrow();
  });
});

describe("input validation", () => {
  it("rejects a too-short summary", () => {
    expect(UpdateSummaryInput.safeParse({ summary: "short" }).success).toBe(false);
  });
  it("requires a prompt or a question for Ask Sparq", () => {
    expect(AssistantRequest.safeParse({ context: "home" }).success).toBe(false);
    expect(AssistantRequest.safeParse({ context: "home", question: "hi" }).success).toBe(true);
  });
});

describe("memory repository", () => {
  beforeEach(() => resetMemoryStore());
  it("toggles a shortlist per owner", async () => {
    const r = createMemoryRepositories();
    expect(await r.shortlists.toggle("u-laura", "ana")).toEqual(["ana"]);
    expect(await r.shortlists.get("u-other")).toEqual([]);
    expect(await r.shortlists.toggle("u-laura", "ana")).toEqual([]);
  });
  it("adds a self-reported skill that becomes searchable via the catalogue", async () => {
    const r = createMemoryRepositories();
    const row = await r.talent.addSkill("ana", { label: "AWS", level: "independent" });
    expect(row.capabilityId).toBe("aws");
    expect(row.selfReported).toBe(true);
    expect((await r.talent.getPerson("ana"))!.evidence.some((e) => e.id === row.id)).toBe(true);
  });
  it("does not leak mutations into the fixtures", async () => {
    const r = createMemoryRepositories();
    await r.talent.updateSummary("ana", "A new summary that is long enough to pass.");
    expect(people.find((p) => p.id === "ana")!.summary).not.toBe("A new summary that is long enough to pass.");
  });
});

describe("Ask Sparq rule-based gateway", () => {
  beforeEach(() => resetMemoryStore());
  const g = () => new RuleBasedAssistant(createMemoryRepositories());
  it("computes January mobile availability from data", async () => {
    const a = await g().answer({ context: "home", promptId: "home-mobile-january" });
    expect(a.provenance).toBe("computed");
    expect(a.refs.map((r) => r.personId)).toEqual(["ana", "javier", "ethan"]);
  });
  it("labels predefined answers as illustrative", async () => {
    const a = await g().answer({ context: "opps", promptId: "opps-vela" });
    expect(a.provenance).toBe("illustrative");
  });
  it("falls back honestly for unknown questions", async () => {
    const a = await g().answer({ context: "home", question: "what is the weather" });
    expect(a.provenance).toBe("fallback");
  });
});
