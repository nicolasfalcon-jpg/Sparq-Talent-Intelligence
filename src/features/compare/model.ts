/**
 * Side-by-side comparison on DOCUMENTED evidence. Pure view-model: no scores, no overall winner, no hidden weighting.
 * People appear in exactly the order the viewer chose; each requirement shows the evidence SOURCE and its VERIFICATION
 * separately; a requirement nobody documented is "not documented", never "no".
 */
import { resolveCapability, seatFit, type SeatFit } from "@/domain/proposals";
import { bestEvidence, describeAvailability, describeEvidence, matchFor, type AvailabilityView } from "@/domain/rules";
import type { Availability, Capability, EvidenceLevel, Person, ProjectExperience, SkillEvidence, Verification } from "@/domain/schemas";

export const COMPARE_MAX = 3;

export type CompareCell = {
  requirement: string;
  level: EvidenceLevel | null;
  verification: Verification | null;
  /** "professional · verified", "independent · self-reported (needs confirmation)", "not documented" */
  text: string;
  /** The person's own description of that evidence, when there is some. */
  detail: string | null;
  needsConfirmation: boolean;
  /** The requirement is not in the skills catalogue, so nobody can match it. */
  uncatalogued: boolean;
};

export type ComparedPerson = {
  /** Only what the page shows: the full profile (summary, preferences…) is deliberately not carried into the view model. */
  person: Pick<Person, "id" | "name" | "headline" | "yearsExperience">;
  availability: AvailabilityView;
  /** Only when comparing for a specific opportunity. */
  fit: SeatFit | null;
  cells: CompareCell[];
  /** Project titles relevant to the requirements (tags or title mention one), otherwise the most recent two. */
  work: string[];
  /** Everything that still needs confirmation or attention, in plain words. */
  toConfirm: string[];
};

export type CompareModel = {
  requirements: string[];
  people: ComparedPerson[];
  context: { id: string; client: string; kickoff: string } | null;
  /** More than COMPARE_MAX ids were requested; the first COMPARE_MAX were used. */
  truncated: boolean;
};

export type CompareRow = { person: Person; evidence: SkillEvidence[]; availability: Availability };

/** Ids from the URL: de-duplicated, order preserved, at most COMPARE_MAX. */
export function parseCompareIds(raw: string | undefined): { ids: string[]; truncated: boolean } {
  const all = [...new Set((raw ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
  return { ids: all.slice(0, COMPARE_MAX), truncated: all.length > COMPARE_MAX };
}

export function buildCompare(input: {
  rows: CompareRow[];
  requirements: string[];
  catalogue: Capability[];
  today: string;
  projects: Record<string, ProjectExperience[]>;
  opportunity?: { id: string; client: string; kickoff: string } | null;
  opportunityName?: (id: string) => string | null;
  truncated?: boolean;
}): CompareModel {
  const requirements = [...new Map(input.requirements.map((r) => [r.toLowerCase(), r])).values()].slice(0, 8);
  const people = input.rows.map((r): ComparedPerson => {
    const cells = requirements.map((label): CompareCell => {
      const cap = resolveCapability(label, input.catalogue);
      if (!cap) return { requirement: label, level: null, verification: null, text: describeEvidence(null, null).text, detail: null, needsConfirmation: false, uncatalogued: true };
      const m = matchFor(r.evidence, cap);
      const best = bestEvidence(r.evidence, cap.id);
      return { requirement: label, level: m.level, verification: m.verification, text: describeEvidence(m.level, m.verification).text, detail: best?.detail || null, needsConfirmation: m.needsConfirmation, uncatalogued: false };
    });
    const av = describeAvailability(r.availability, input.today);
    const fit = input.opportunity ? seatFit(r.availability, input.opportunity.kickoff, input.opportunity.id, input.today, input.opportunityName) : null;
    const lower = requirements.map((q) => q.toLowerCase());
    const mine = input.projects[r.person.id] ?? [];
    const relevant = mine.filter((p) => lower.some((q) => p.tags.some((t) => t.toLowerCase().includes(q)) || p.title.toLowerCase().includes(q)));
    const work = (relevant.length ? relevant : mine).slice(0, 2).map((p) => `${p.client} · ${p.title}`);
    const toConfirm = [
      ...cells.filter((c) => c.needsConfirmation).map((c) => `${c.requirement}: ${c.text}`),
      ...(av.confirmed ? [] : [`Availability from ${r.availability.availableFrom} is not confirmed yet`]),
      ...(fit && fit.conflict && fit.kind !== "pending" ? [fit.text] : []),
    ];
    return { person: { id: r.person.id, name: r.person.name, headline: r.person.headline, yearsExperience: r.person.yearsExperience }, availability: av, fit, cells, work, toConfirm };
  });
  return { requirements, people, context: input.opportunity ?? null, truncated: input.truncated ?? false };
}
