/**
 * Pure business rules. No I/O, no framework code — unit-tested in tests/unit.
 *
 * Guardrail: nothing in this module produces a number that is shown about a person.
 * Ordering uses documented evidence and availability, and the UI says so explicitly.
 */
import { addDays, daysBetween, formatPartialDate, formatShortDate } from "./dates";
import type { DomainRuleCode } from "./errors";
import type { Availability, Capability, Discipline, EvidenceLevel, Opportunity, Person, ProjectExperience, SkillEvidence, SkillGroup, Verification } from "./schemas";
import { EVIDENCE_ORDER, VERIFICATION_ORDER } from "./schemas";

/* ---------------- Availability ---------------- */

export type AvailabilityView = {
  isNow: boolean;
  /** "Available now" | "Available from Jan 5" */
  text: string;
  /** "Free now" | "Jan 5" (compact, used on Home cards) */
  compact: string;
  confirmed: boolean;
  /** "Confirmed" | "Pending confirmation" */
  statusLabel: string;
};

export function describeAvailability(av: Availability, today: string): AvailabilityView {
  const isNow = daysBetween(today, av.availableFrom) <= 0;
  return {
    isNow,
    text: isNow ? "Available now" : `Available from ${formatShortDate(av.availableFrom)}`,
    compact: isNow ? "Free now" : formatShortDate(av.availableFrom),
    confirmed: av.status === "confirmed",
    statusLabel: av.status === "confirmed" ? "Confirmed" : "Pending confirmation",
  };
}

export function isAvailableBy(av: Availability, isoDate: string): boolean {
  return daysBetween(av.availableFrom, isoDate) >= 0;
}

/** People free within `days` of today (inclusive), soonest first. */
export function freeWithin<T extends { availability: Availability; person: Person }>(rows: T[], today: string, days: number): T[] {
  const limit = addDays(today, days);
  return rows
    .filter((r) => isAvailableBy(r.availability, limit))
    .sort((a, b) => a.availability.availableFrom.localeCompare(b.availability.availableFrom));
}

/* ---------------- Evidence & capabilities ---------------- */

export function strongestLevel(levels: EvidenceLevel[]): EvidenceLevel | null {
  for (const l of EVIDENCE_ORDER) if (levels.includes(l)) return l;
  return null;
}

/** The strongest documented SOURCE a person has for a capability (verification is ignored here), or null when not documented. */
export function levelFor(personEvidence: SkillEvidence[], capabilityId: string): EvidenceLevel | null {
  return strongestLevel(personEvidence.filter((e) => e.capabilityId === capabilityId).map((e) => e.level));
}

function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9.#+\- ]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

/**
 * Interpret a plain-language request into catalogue capabilities.
 * Deterministic alias matching — this is the seam where an LLM-based parser can be plugged in later
 * (it must still return catalogue ids so results stay explainable).
 */
export function interpretQuery(text: string, catalogue: Capability[]): Capability[] {
  const q = normalise(text);
  const found: Capability[] = [];
  // Longer aliases first so "react native" wins over "react".
  const pairs = catalogue.flatMap((c) => [c.name, ...c.aliases].map((a) => ({ c, a: normalise(a) })));
  pairs.sort((x, y) => y.a.length - x.a.length);
  let rest = q;
  for (const { c, a } of pairs) {
    if (rest.includes(a)) {
      if (!found.some((f) => f.id === c.id)) found.push(c);
      rest = rest.split(a).join(" ");
    }
  }
  return found;
}

/* ---------------- Evidence source × verification ---------------- */

/** Practical = something the person actually did (professional work or an independent project). */
export const isPractical = (source: EvidenceLevel): boolean => source === "professional" || source === "independent";

/**
 * How a piece of evidence supports a requirement, for display and ordering. Source and verification are separate:
 * - verified_practical: professional or independent work that a reviewer confirmed
 * - unverified_practical: professional or independent work that is self-reported or pending (needs confirmation)
 * - learning: training or learning, whatever its verification
 */
export type EvidenceBasis = "verified_practical" | "unverified_practical" | "learning";

export function evidenceBasis(e: Pick<SkillEvidence, "level" | "verification">): EvidenceBasis {
  if (!isPractical(e.level)) return "learning";
  return e.verification === "verified" ? "verified_practical" : "unverified_practical";
}

const BASIS_RANK: Record<EvidenceBasis, number> = { verified_practical: 0, unverified_practical: 1, learning: 2 };

/** The evidence that best supports a capability: verified practical work first, then professional over independent. */
export function bestEvidence(personEvidence: SkillEvidence[], capabilityId: string): SkillEvidence | null {
  const rows = personEvidence.filter((e) => e.capabilityId === capabilityId);
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) =>
    BASIS_RANK[evidenceBasis(a)] - BASIS_RANK[evidenceBasis(b)]
    || EVIDENCE_ORDER.indexOf(a.level) - EVIDENCE_ORDER.indexOf(b.level)
    || VERIFICATION_ORDER.indexOf(a.verification) - VERIFICATION_ORDER.indexOf(b.verification),
  )[0]!;
}

const SOURCE_WORD: Record<EvidenceLevel, string> = { professional: "professional", independent: "independent", training: "training", emerging: "learning" };
export const sourceWord = (l: EvidenceLevel): string => SOURCE_WORD[l];

export const VERIFICATION_LABEL: Record<Verification, string> = { verified: "verified", pending: "pending verification", self_reported: "self-reported" };

/** "professional · verified", "independent · self-reported (needs confirmation)". Missing evidence is "not documented". */
export function describeEvidence(level: EvidenceLevel | null, verification: Verification | null): { text: string; needsConfirmation: boolean } {
  if (level === null || verification === null) return { text: "not documented", needsConfirmation: false };
  const needsConfirmation = verification !== "verified";
  return { text: `${sourceWord(level)} · ${VERIFICATION_LABEL[verification]}${needsConfirmation ? " (needs confirmation)" : ""}`, needsConfirmation };
}

/** Footer line of a project's evidence panel: who confirmed it, or that it is still the person's own claim. */
export function projectVerificationText(p: Pick<ProjectExperience, "verification" | "verifiedBy" | "verifiedOn">): string {
  if (p.verification === "verified") return `Confirmed by ${p.verifiedBy ?? "a reviewer"}${p.verifiedOn ? ` · ${formatPartialDate(p.verifiedOn)}` : ""}`;
  if (p.verification === "pending") return "Verification pending · a delivery lead has not decided yet";
  return "Self-reported · awaiting confirmation by a delivery lead";
}

/* ---------------- Evidence mutation rules (owner side) ---------------- */

export type RuleDecision = { allowed: true } | { allowed: false; code: DomainRuleCode; reason: string };

/**
 * An owner may withdraw their own unverified claims (self-reported, or pending which just cancels the request).
 * Verified evidence, and its verification history, can never be removed or altered by the owner: that needs a
 * correction request handled by a reviewer (future delivery-lead workflow, not built yet).
 */
export function canOwnerRemoveEvidence(e: Pick<SkillEvidence, "verification" | "label">): RuleDecision {
  if (e.verification === "verified") {
    return { allowed: false, code: "evidence_locked", reason: `“${e.label}” was verified by a reviewer, so it can’t be removed here. Ask a delivery lead to correct it.` };
  }
  return { allowed: true };
}

/**
 * No exact duplicates: the same skill label, for the same capability and source, is already on the passport. A different
 * label for the same capability stays allowed (it is a different claim, and matching always uses the best evidence per
 * capability, so it cannot hide or double count verified evidence).
 */
export function canOwnerAddEvidence(existing: Pick<SkillEvidence, "capabilityId" | "level" | "label">[], candidate: { capabilityId: string; level: EvidenceLevel; label: string }): RuleDecision {
  const norm = (l: string) => l.trim().toLowerCase();
  if (existing.some((e) => e.capabilityId === candidate.capabilityId && e.level === candidate.level && norm(e.label) === norm(candidate.label))) {
    return { allowed: false, code: "duplicate_evidence", reason: "That is already on your passport with the same source." };
  }
  return { allowed: true };
}

/* ---------------- Evidence-aware talent discovery ---------------- */

export type CapabilityMatch = {
  capabilityId: string;
  name: string;
  /** Evidence SOURCE of the best evidence (null = not documented). */
  level: EvidenceLevel | null;
  /** Verification of that same evidence (null = not documented). */
  verification: Verification | null;
  /** True when there is evidence but a reviewer has not confirmed it. Never true for "not documented". */
  needsConfirmation: boolean;
};

export type PersonMatch = { personId: string; matches: CapabilityMatch[] };

export function matchFor(evidence: SkillEvidence[], c: Pick<Capability, "id" | "name">): CapabilityMatch {
  const best = bestEvidence(evidence, c.id);
  return { capabilityId: c.id, name: c.name, level: best?.level ?? null, verification: best?.verification ?? null, needsConfirmation: !!best && best.verification !== "verified" };
}

/**
 * Filter and order people for a set of requested capabilities. Deterministic and requirement-specific:
 * - Only people with at least one documented match are returned. Missing evidence is "not documented", never a "no".
 * - Ordering compares, in this order (all counts are over the REQUESTED capabilities only):
 *     1. requirements backed by verified practical experience (professional or independent, confirmed by a reviewer)
 *     2. of those, how many rest on professional work (professional before independent)
 *     3. requirements backed by practical experience that still needs confirmation (self-reported or pending)
 *     4. of those, how many rest on professional work
 *     5. requirements with training or learning only
 *     6. earlier availability
 *     7. name, only as a neutral tie-break so the result never depends on the order the data arrived in
 * - Independent experience stays discoverable: it is practical experience and outranks training in both steps 1 and 3.
 * - No score or rank is computed, stored or returned; callers show the per-requirement evidence basis instead.
 */
export function matchPeople(
  requested: Capability[],
  rows: { person: Person; evidence: SkillEvidence[]; availability: Availability }[],
): PersonMatch[] {
  if (requested.length === 0) return rows.map((r) => ({ personId: r.person.id, matches: [] }));
  const withMatches = rows.map((r) => ({ r, matches: requested.map((c) => matchFor(r.evidence, c)) }));
  const basisOf = (m: CapabilityMatch): EvidenceBasis | null => (m.level === null || m.verification === null ? null : evidenceBasis({ level: m.level, verification: m.verification }));
  const count = (ms: CapabilityMatch[], basis: EvidenceBasis, source?: EvidenceLevel) => ms.filter((m) => basisOf(m) === basis && (!source || m.level === source)).length;
  return withMatches
    .filter((x) => x.matches.some((m) => m.level !== null))
    .sort((a, b) =>
      count(b.matches, "verified_practical") - count(a.matches, "verified_practical")
      || count(b.matches, "verified_practical", "professional") - count(a.matches, "verified_practical", "professional")
      || count(b.matches, "unverified_practical") - count(a.matches, "unverified_practical")
      || count(b.matches, "unverified_practical", "professional") - count(a.matches, "unverified_practical", "professional")
      || count(b.matches, "learning") - count(a.matches, "learning")
      || a.r.availability.availableFrom.localeCompare(b.r.availability.availableFrom)
      || a.r.person.name.localeCompare(b.r.person.name),
    )
    .map((x) => ({ personId: x.r.person.id, matches: x.matches }));
}

export type PeopleFilters = { discipline: Discipline | "All"; availableBy: string | null };

export function applyPeopleFilters<T extends { person: Person; availability: Availability }>(rows: T[], f: PeopleFilters): T[] {
  return rows.filter((r) => (f.discipline === "All" || r.person.discipline === f.discipline) && (!f.availableBy || isAvailableBy(r.availability, f.availableBy)));
}

/* ---------------- Passport grouping ---------------- */

const GROUP_LABELS: Record<SkillGroup, { title: string; description: string }> = {
  mobile: { title: "Mobile engineering", description: "Cross-platform and native" },
  web: { title: "Web & APIs", description: "Applications and services" },
  ai: { title: "Applied AI", description: "Models and AI products" },
  data: { title: "Data", description: "Platforms and pipelines" },
  cloud: { title: "Cloud & platform", description: "Infrastructure and operations" },
  quality: { title: "Quality", description: "Testing and automation" },
  architecture: { title: "Architecture", description: "Systems design" },
};

export type PassportSkillGroup = { title: string; description: string; skills: SkillEvidence[] };

export function groupPassportSkills(person: Person, evidence: SkillEvidence[], catalogue: Capability[]): PassportSkillGroup[] {
  const groupOf = (e: SkillEvidence): SkillGroup => catalogue.find((c) => c.id === e.capabilityId)?.group ?? "web";
  if (person.passportGroups?.length) {
    return person.passportGroups.map((g) => ({ title: g.title, description: g.description, skills: evidence.filter((e) => g.groups.includes(groupOf(e))) }));
  }
  const order: SkillGroup[] = ["mobile", "web", "ai", "data", "cloud", "quality", "architecture"];
  return order
    .map((g) => ({ ...GROUP_LABELS[g], skills: evidence.filter((e) => groupOf(e) === g) }))
    .filter((g) => g.skills.length > 0);
}

/* ---------------- Opportunities ---------------- */

export function seatCounts(o: Opportunity): { total: number; proposed: number; open: number } {
  const proposed = o.roles.filter((r) => r.proposedPersonId).length;
  return { total: o.roles.length, proposed, open: o.roles.length - proposed };
}

/** Deterministic requirement summary shown in the opportunity drawer. */
export function requirementSummary(o: Opportunity, durationLabel: string, kickoffLabel: string): string[] {
  const { total, open } = seatCounts(o);
  return [
    `${total} roles, ${open} still open`,
    `Key capabilities: ${o.capabilities.join(", ")}`,
    `Kick-off ${kickoffLabel} · ${durationLabel} · delivery lead ${o.deliveryLead}`,
  ];
}

export function seatsLabel(o: Opportunity): string {
  const { total, proposed, open } = seatCounts(o);
  return proposed > 0 ? `${proposed} of ${total} seats proposed` : `${open} open seats`;
}
