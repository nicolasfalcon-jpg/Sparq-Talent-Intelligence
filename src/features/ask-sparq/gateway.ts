import "server-only";
/**
 * Ask Sparq gateway (server-side).
 *
 * `AssistantGateway` is the seam for real intelligence. Phase 1 ships `RuleBasedAssistant`:
 *  - "computed" answers are derived deterministically from repository data (real, explainable, no AI);
 *  - "illustrative" answers are the predefined V4.2 examples (always labelled as such);
 *  - anything else gets an honest fallback.
 * Phase 3: implement `LlmAssistant` behind the same interface (server-only API key, retrieval over
 * documented evidence, citations → `refs`, no scoring of people, audit log). See docs/handoff.
 */
import type { Repositories, PersonAggregate } from "@/data/repositories";
import { describeAvailability, interpretQuery, isAvailableBy, levelFor, matchPeople } from "@/domain/rules";
import type { AssistantRequest, Discipline } from "@/domain/schemas";
import { ASSISTANT_CONTENT, type AssistantAnswer, type AssistantRef } from "./content";

export interface AssistantGateway {
  answer(req: AssistantRequest): Promise<AssistantAnswer>;
}

const LEVEL_WORD = { professional: "professional", independent: "independent", training: "training", emerging: "emerging" } as const;
const NUM = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const n = (k: number) => NUM[k] ?? String(k);

export class RuleBasedAssistant implements AssistantGateway {
  constructor(private readonly repos: Repositories) {}

  async answer(req: AssistantRequest): Promise<AssistantAnswer> {
    const content = ASSISTANT_CONTENT[req.context];
    const prompt = req.promptId ? content.prompts.find((p) => p.id === req.promptId) : undefined;
    const question = prompt?.q ?? req.question ?? "";

    if (prompt?.id === "home-mobile-january") return this.freeByMonth(question, "Mobile", "2027-01-31", "January");
    if (prompt?.id === "people-rn-ios") return this.skills(question);
    if (prompt?.id === "passport-summary" && req.subjectPersonId) return this.passportSummary(question, req.subjectPersonId);
    if (prompt?.id === "passport-gaps" && req.subjectPersonId) return this.passportGaps(question, req.subjectPersonId);
    if (prompt) return { question, answer: prompt.a, bullets: prompt.bullets ?? [], refs: prompt.refs ?? [], actions: prompt.actions ?? [], provenance: "illustrative" };

    // Free text: try deterministic intents first.
    const text = question.toLowerCase();
    if (/\b(team|project|build|staff)\b/.test(text)) {
      return { question, answer: "That sounds like a new team. I can draft the roles and find people with documented experience for each one.", bullets: [], refs: [], provenance: "fallback",
        actions: [{ label: "Build a team", href: "/opportunities/new/team", variant: "ink" }, { label: "Just one role", href: "/opportunities/new/role", variant: "soft" }] };
    }
    const caps = interpretQuery(question, await this.repos.talent.listCapabilities());
    if (/\b(free|available|availability)\b/.test(text) && /\bmobile\b/.test(text) && /\bjanuary\b/.test(text)) return this.freeByMonth(question, "Mobile", "2027-01-31", "January");
    if (caps.length > 0) return this.skills(question);

    const words = text.split(/\s+/).filter((w) => w.length > 4);
    const hit = content.prompts.find((p) => !p.computed && words.some((w) => p.q.toLowerCase().includes(w)));
    if (hit) return { question, answer: hit.a, bullets: hit.bullets ?? [], refs: hit.refs ?? [], actions: hit.actions ?? [], provenance: "illustrative" };

    return { question, answer: "I can answer questions about documented skills, availability and open roles. Try one of the suggestions, or name a capability such as “React Native” or “AWS”.", bullets: [], refs: [], actions: [{ label: "Browse people", href: "/people", variant: "soft" }], provenance: "fallback" };
  }

  private async freeByMonth(question: string, discipline: Discipline, byIso: string, monthName: string): Promise<AssistantAnswer> {
    const today = this.repos.clock.today();
    const rows = (await this.repos.talent.listPeople())
      .filter((r) => r.person.discipline === discipline && isAvailableBy(r.availability, byIso))
      .sort((a, b) => a.availability.availableFrom.localeCompare(b.availability.availableFrom));
    const allConfirmed = rows.every((r) => r.availability.status === "confirmed");
    const refs: AssistantRef[] = rows.map((r) => {
      const av = describeAvailability(r.availability, today);
      return { personId: r.person.id, name: r.person.name, evidence: r.evidence.filter((e) => e.level === "professional" && e.capabilityId !== "typescript").slice(0, 2).map((e) => e.label).join(" · "), href: `/people/${r.person.id}`, when: av.compact, whenTone: av.confirmed ? "ok" : "mute" };
    });
    return {
      question,
      answer: rows.length === 0
        ? `Nobody with documented ${discipline.toLowerCase()} experience is free in ${monthName}.`
        : `${n(rows.length)} ${rows.length === 1 ? "engineer" : "engineers"} with documented ${discipline.toLowerCase()} experience ${rows.length === 1 ? "is" : "are"} free in ${monthName}${allConfirmed ? ", all confirmed" : ", some still pending confirmation"}.`,
      bullets: [], refs,
      actions: [{ label: "Build a team with them", href: "/opportunities/new/team", variant: "ink" }, { label: "Open Planning", href: "/planning", variant: "soft" }],
      provenance: "computed",
    };
  }

  private async skills(question: string): Promise<AssistantAnswer> {
    const catalogue = await this.repos.talent.listCapabilities();
    const caps = interpretQuery(question, catalogue);
    const rows = await this.repos.talent.listPeople();
    const matches = matchPeople(caps, rows).slice(0, 3);
    const byId = new Map(rows.map((r) => [r.person.id, r]));
    const refs: AssistantRef[] = matches.map((m) => {
      const r = byId.get(m.personId) as PersonAggregate;
      const all = m.matches.every((x) => x.level === "professional");
      return {
        personId: m.personId, name: r.person.name, href: `/people/${m.personId}`,
        evidence: m.matches.map((x) => `${x.name}: ${x.level ? LEVEL_WORD[x.level] : "not documented"}`).join(" · "),
        when: all ? "All" : `${m.matches.filter((x) => x.level === "professional").length} of ${m.matches.length}`, whenTone: all ? "ok" : "mute",
      };
    });
    const full = matches.filter((m) => m.matches.every((x) => x.level === "professional")).length;
    const names = caps.map((c) => c.name).join(" and ");
    return {
      question,
      answer: matches.length === 0 ? `Nobody has documented experience in ${names} yet.`
        : `${n(full)} ${full === 1 ? "person has" : "people have"} professional experience in ${caps.length > 1 ? "all of " : ""}${names}.${matches.length > full ? ` ${n(matches.length - full)} more ${matches.length - full === 1 ? "covers" : "cover"} part of it.` : ""}`,
      bullets: [], refs,
      actions: [{ label: "Search in People", href: `/people?q=${encodeURIComponent(question)}`, variant: "ink" }],
      provenance: "computed",
    };
  }

  private async passportSummary(question: string, personId: string): Promise<AssistantAnswer> {
    const agg = await this.repos.talent.getPerson(personId);
    const projects = await this.repos.talent.listProjects(personId);
    if (!agg) return { question, answer: "I couldn’t find that profile.", bullets: [], refs: [], actions: [], provenance: "fallback" };
    const pro = agg.evidence.filter((e) => e.level === "professional").map((e) => e.label);
    return {
      question,
      answer: `${agg.person.name.split(" ")[0]} has professional evidence in ${pro.slice(0, 4).join(", ")}${pro.length > 4 ? ` and ${pro.length - 4} more` : ""}.`,
      bullets: projects.slice(0, 3).map((p) => `${p.client} · ${p.role}: ${p.title}`),
      refs: [], actions: [{ label: "Open the passport", href: `/people/${personId}`, variant: "soft" }], provenance: "computed",
    };
  }

  private async passportGaps(question: string, personId: string): Promise<AssistantAnswer> {
    const agg = await this.repos.talent.getPerson(personId);
    if (!agg) return { question, answer: "I couldn’t find that profile.", bullets: [], refs: [], actions: [], provenance: "fallback" };
    const weak = [...new Set(agg.evidence.filter((e) => levelFor(agg.evidence, e.capabilityId) !== "professional").map((e) => `${e.label} · ${LEVEL_WORD[e.level]} only`))];
    const self = agg.evidence.filter((e) => e.selfReported).map((e) => `${e.label} · added by the person, awaiting confirmation`);
    const bullets = [...weak, ...self].slice(0, 5);
    return {
      question,
      answer: bullets.length ? `${bullets.length} ${bullets.length === 1 ? "area has" : "areas have"} no professional evidence yet.` : "Every listed capability has professional evidence.",
      bullets, refs: [], actions: [], provenance: "computed",
    };
  }
}
