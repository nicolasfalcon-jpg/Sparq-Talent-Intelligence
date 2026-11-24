import "server-only";
/**
 * Ask Sparq gateway (server-side), phase 2B.1.
 *
 * `AssistantGateway` (./contract.ts) is the seam for real intelligence. `RuleBasedAssistant` is the deterministic
 * implementation:
 *  - "computed" answers are derived from repository data by deterministic code (real, explainable, no AI);
 *  - "illustrative" answers are the predefined V4.2 examples (always labelled as such);
 *  - anything else gets an honest fallback.
 *
 * What changed in 2B.1 (and what any future provider must keep):
 *  - it is USER-AWARE: every call receives the authenticated `actor`, and people data is read only through
 *    `scopedTalent(repos, actor)`, so the answer can never contain more than that user may read. Private career
 *    interests are never read here at all;
 *  - free text goes through the responsible-use policy first (no ranking, scoring, "weakest", personal-trait inference or
 *    autonomous staffing decisions), then through the deterministic intents;
 *  - evidence is described by SOURCE and VERIFICATION separately, so self-reported or pending claims are never presented
 *    as confirmed facts, and missing evidence is "not documented", never "can't".
 */
import { scopedTalent, type ScopedTalent } from "@/data/repositories/scoped";
import type { Repositories } from "@/data/repositories";
import { ForbiddenError } from "@/domain/errors";
import { authorize } from "@/domain/policy";
import {
  bestEvidence, describeAvailability, describeEvidence, evidenceBasis, interpretQuery, isAvailableBy, matchPeople, sourceWord, VERIFICATION_LABEL,
} from "@/domain/rules";
import type { Discipline, SkillEvidence } from "@/domain/schemas";
import { assessTalentRequest, type PolicyCategory } from "@/domain/talent-policy";
import { ASSISTANT_CONTENT, type AssistantAnswer, type AssistantRef } from "./content";
import type { AssistantActor, AssistantGateway, ResolvedAssistantRequest } from "./contract";

export type { AssistantActor, AssistantGateway, ResolvedAssistantRequest } from "./contract";

const NUM = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const n = (k: number) => NUM[k] ?? String(k);

const noEvidenceOrFlag = (e: SkillEvidence) => `${e.label}${e.verification === "verified" ? "" : ` (${VERIFICATION_LABEL[e.verification]})`}`;

const SCOPE_ANSWER: AssistantAnswer = {
  question: "", answer: "I can only use your own passport and open opportunities. For anything about other people, ask your staffing lead.", bullets: [], refs: [],
  actions: [{ label: "Back to my passport", href: "/me/passport", variant: "soft" }], provenance: "fallback",
};

export class RuleBasedAssistant implements AssistantGateway {
  constructor(private readonly repos: Repositories) {}

  async answer(req: ResolvedAssistantRequest, actor: AssistantActor): Promise<AssistantAnswer> {
    const talent = scopedTalent(this.repos, actor);
    try {
      return await this.respond(req, actor, talent);
    } catch (e) {
      // A deterministic intent needed data this user may not read: say so plainly, reveal nothing.
      if (e instanceof ForbiddenError) return { ...SCOPE_ANSWER, question: req.question };
      throw e;
    }
  }

  private async respond(req: ResolvedAssistantRequest, actor: AssistantActor, talent: ScopedTalent): Promise<AssistantAnswer> {
    const content = ASSISTANT_CONTENT[req.context];
    const prompt = req.promptId ? content.prompts.find((p) => p.id === req.promptId) : undefined;
    const question = req.question;

    if (prompt?.id === "home-mobile-january") return this.freeByMonth(talent, question, "Mobile", "2027-01-31", "January");
    if (prompt?.id === "people-rn-ios") return this.skills(talent, question);
    if (prompt?.id === "passport-summary" && req.subjectPersonId) return this.passportSummary(talent, actor, question, req.subjectPersonId);
    if (prompt?.id === "passport-gaps" && req.subjectPersonId) return this.passportGaps(talent, question, req.subjectPersonId);
    if (prompt) return { question, answer: prompt.a, bullets: prompt.bullets ?? [], refs: prompt.refs ?? [], actions: prompt.actions ?? [], provenance: "illustrative" };

    // Free text. 1) Responsible-use policy first.
    const names = authorize(actor, "people:list").allowed ? (await talent.listPeople()).map((r) => r.person.name) : [];
    const verdict = assessTalentRequest(question, names);
    if (!verdict.allowed) return this.declined(talent, actor, question, verdict.category, verdict.explanation, verdict.alternatives);

    // 2) Deterministic intents.
    const text = question.toLowerCase();
    if (/\b(team|project|build|staff)\b/.test(text)) {
      return { question, answer: "That sounds like a new team. I can draft the roles and find people with documented experience for each one.", bullets: [], refs: [], provenance: "fallback",
        actions: [{ label: "Build a team", href: "/opportunities/new/team", variant: "ink" }, { label: "Just one role", href: "/opportunities/new/role", variant: "soft" }] };
    }
    const caps = interpretQuery(question, await talent.listCapabilities());
    if (/\b(free|available|availability)\b/.test(text) && /\bmobile\b/.test(text) && /\bjanuary\b/.test(text)) return this.freeByMonth(talent, question, "Mobile", "2027-01-31", "January");
    if (caps.length > 0) return this.skills(talent, question);

    const words = text.split(/\s+/).filter((w) => w.length > 4);
    const hit = content.prompts.find((p) => !p.computed && words.some((w) => p.q.toLowerCase().includes(w)));
    if (hit) return { question, answer: hit.a, bullets: hit.bullets ?? [], refs: hit.refs ?? [], actions: hit.actions ?? [], provenance: "illustrative" };

    return { question, answer: "I can answer questions about documented skills, availability and open roles. Try one of the suggestions, or name a capability such as “React Native” or “AWS”.", bullets: [], refs: [], actions: [{ label: "Browse people", href: "/people", variant: "soft" }], provenance: "fallback" };
  }

  /** A request the responsible-use policy declines: a short explanation plus a legitimate, requirement-based alternative. */
  private async declined(talent: ScopedTalent, actor: AssistantActor, question: string, category: PolicyCategory, explanation: string, alternatives: string[]): Promise<AssistantAnswer> {
    const staff = authorize(actor, "people:list").allowed;
    const base: AssistantAnswer = {
      question, answer: explanation, policy: category, provenance: "fallback", refs: [],
      bullets: staff ? alternatives.map((q) => `Try: “${q}”`) : ["I can help you see how your own documented experience reads for a role."],
      actions: !staff ? [{ label: "Back to my passport", href: "/me/passport", variant: "soft" }]
        : category === "autonomous_decision"
          ? [{ label: "Fill a role", href: "/opportunities/new/role", variant: "ink" }, { label: "Build a team", href: "/opportunities/new/team", variant: "soft" }]
          : [{ label: "Search by requirement", href: "/people", variant: "ink" }, { label: "Open Planning", href: "/planning", variant: "soft" }],
    };
    // "Who is the best React Native engineer?": decline the ranking, but still help with the requirement it names.
    if (staff && category === "ranking") {
      const caps = interpretQuery(question, await talent.listCapabilities());
      if (caps.length > 0) {
        const found = await this.skills(talent, question);
        return { ...base, answer: `${explanation} Here is who has documented experience in ${caps.map((c) => c.name).join(" and ")}, with the evidence behind it. The order is not a ranking of people.`, refs: found.refs, actions: found.actions };
      }
    }
    return base;
  }

  private async freeByMonth(talent: ScopedTalent, question: string, discipline: Discipline, byIso: string, monthName: string): Promise<AssistantAnswer> {
    const today = this.repos.clock.today();
    const rows = (await talent.listPeople())
      .filter((r) => r.person.discipline === discipline && isAvailableBy(r.availability, byIso))
      .sort((a, b) => a.availability.availableFrom.localeCompare(b.availability.availableFrom));
    const allConfirmed = rows.every((r) => r.availability.status === "confirmed");
    const refs: AssistantRef[] = rows.map((r) => {
      const av = describeAvailability(r.availability, today);
      // Verified work first; anything not yet confirmed is flagged next to its label.
      const practical = r.evidence.filter((e) => e.level === "professional" && e.capabilityId !== "typescript")
        .sort((a, b) => Number(b.verification === "verified") - Number(a.verification === "verified")).slice(0, 2);
      return { personId: r.person.id, name: r.person.name, evidence: practical.map(noEvidenceOrFlag).join(" · "), href: `/people/${r.person.id}`, when: av.compact, whenTone: av.confirmed ? "ok" : "mute" };
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

  /** Requirement-based discovery. Each reference shows the evidence basis per requirement: source AND verification. */
  private async skills(talent: ScopedTalent, question: string): Promise<AssistantAnswer> {
    const catalogue = await talent.listCapabilities();
    const caps = interpretQuery(question, catalogue);
    const rows = await talent.listPeople();
    const matches = matchPeople(caps, rows).slice(0, 3);
    const byId = new Map(rows.map((r) => [r.person.id, r]));
    const verifiedAll = (m: { matches: { level: string | null; verification: string | null }[] }) => m.matches.every((x) => x.level !== null && x.verification === "verified" && (x.level === "professional" || x.level === "independent"));
    const refs: AssistantRef[] = matches.map((m) => {
      const r = byId.get(m.personId)!;
      const verifiedCount = m.matches.filter((x) => x.verification === "verified" && (x.level === "professional" || x.level === "independent")).length;
      const all = verifiedAll(m);
      return {
        personId: m.personId, name: r.person.name, href: `/people/${m.personId}`,
        evidence: m.matches.map((x) => `${x.name}: ${describeEvidence(x.level, x.verification).text}`).join(" · "),
        when: all ? "All verified" : `${verifiedCount} of ${m.matches.length} verified`, whenTone: all ? "ok" : "mute",
      };
    });
    const full = matches.filter((m) => m.matches.every((x) => x.level === "professional" && x.verification === "verified")).length;
    const names = caps.map((c) => c.name).join(" and ");
    return {
      question,
      answer: matches.length === 0 ? `Nobody has documented experience in ${names} yet. That is not the same as nobody having it.`
        : `${n(full)} ${full === 1 ? "person has" : "people have"} verified professional experience in ${caps.length > 1 ? "all of " : ""}${names}.${matches.length > full ? ` ${n(matches.length - full)} more ${matches.length - full === 1 ? "has" : "have"} part of it, or experience that still needs confirmation.` : ""}`,
      bullets: [], refs,
      actions: [{ label: "Search in People", href: `/people?q=${encodeURIComponent(question)}`, variant: "ink" }],
      provenance: "computed",
    };
  }

  private async passportSummary(talent: ScopedTalent, actor: AssistantActor, question: string, personId: string): Promise<AssistantAnswer> {
    const agg = await talent.getPerson(personId); // asserts passport:read for this actor
    if (!agg) return { question, answer: "I couldn’t find that profile.", bullets: [], refs: [], actions: [], provenance: "fallback" };
    const projects = await talent.listProjects(personId);
    const first = agg.person.name.split(" ")[0];
    const professional = agg.evidence.filter((e) => e.level === "professional");
    const verified = professional.filter((e) => e.verification === "verified").map((e) => e.label);
    const unconfirmed = professional.filter((e) => e.verification !== "verified").map((e) => e.label);
    let answer: string;
    if (verified.length) {
      answer = `${first} has verified professional experience in ${verified.slice(0, 4).join(", ")}${verified.length > 4 ? ` and ${verified.length - 4} more` : ""}.`;
      if (unconfirmed.length) answer += ` Not confirmed yet: ${unconfirmed.slice(0, 3).join(", ")}.`;
    } else if (unconfirmed.length) {
      answer = `${first} reports professional experience in ${unconfirmed.slice(0, 4).join(", ")}, which a delivery lead has not confirmed yet.`;
    } else {
      answer = `No professional experience is documented for ${first} yet. That is not the same as having none.`;
    }
    return {
      question, answer,
      bullets: projects.slice(0, 3).map((p) => `${p.client} · ${p.role}: ${p.title}${p.verification === "verified" ? "" : ` (${VERIFICATION_LABEL[p.verification]})`}`),
      refs: [], actions: [{ label: "Open the passport", href: actor.role === "staffing_lead" ? `/people/${personId}` : "/me/passport", variant: "soft" }], provenance: "computed",
    };
  }

  private async passportGaps(talent: ScopedTalent, question: string, personId: string): Promise<AssistantAnswer> {
    const agg = await talent.getPerson(personId);
    if (!agg) return { question, answer: "I couldn’t find that profile.", bullets: [], refs: [], actions: [], provenance: "fallback" };
    const seen = new Set<string>();
    const bullets: string[] = [];
    for (const e of agg.evidence) {
      if (seen.has(e.capabilityId)) continue;
      seen.add(e.capabilityId);
      const best = bestEvidence(agg.evidence, e.capabilityId)!;
      const basis = evidenceBasis(best);
      if (basis === "verified_practical") continue;
      bullets.push(basis === "unverified_practical"
        ? `${best.label} · ${sourceWord(best.level)} · ${VERIFICATION_LABEL[best.verification]}, awaiting confirmation`
        : `${best.label} · ${sourceWord(best.level)} only`);
    }
    const shown = bullets.slice(0, 5);
    return {
      question,
      answer: bullets.length ? `${bullets.length} ${bullets.length === 1 ? "area has" : "areas have"} no verified professional or independent experience yet.` : "Every documented capability has verified experience.",
      bullets: shown, refs: [], actions: [], provenance: "computed",
    };
  }
}
