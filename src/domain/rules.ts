/**
 * Pure business rules. No I/O, no framework code — unit-tested in tests/unit.
 *
 * Guardrail: nothing in this module produces a number that is shown about a person.
 * Ordering uses documented evidence and availability, and the UI says so explicitly.
 */
import { addDays, daysBetween, formatShortDate } from "./dates";
import type { Availability, Capability, Discipline, EvidenceLevel, Opportunity, Person, SkillEvidence, SkillGroup } from "./schemas";
import { EVIDENCE_ORDER } from "./schemas";

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

/** The strongest documented level a person has for a capability, or null when not documented. */
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

export type CapabilityMatch = { capabilityId: string; name: string; level: EvidenceLevel | null };

export type PersonMatch = { personId: string; matches: CapabilityMatch[] };

/**
 * Filter and order people for a set of requested capabilities.
 * - Only people with at least one documented match are returned.
 * - Ordering: more professional matches, then more documented matches of any level,
 *   then independent work over training, then sooner availability.
 * - No score is returned or displayed; callers show the per-capability evidence instead.
 */
export function matchPeople(
  requested: Capability[],
  rows: { person: Person; evidence: SkillEvidence[]; availability: Availability }[],
): PersonMatch[] {
  if (requested.length === 0) return rows.map((r) => ({ personId: r.person.id, matches: [] }));
  const withMatches = rows.map((r) => ({
    r,
    matches: requested.map((c) => ({ capabilityId: c.id, name: c.name, level: levelFor(r.evidence, c.id) })),
  }));
  return withMatches
    .filter((x) => x.matches.some((m) => m.level !== null))
    .sort((a, b) => {
      const pro = (m: CapabilityMatch[]) => m.filter((x) => x.level === "professional").length;
      const ind = (m: CapabilityMatch[]) => m.filter((x) => x.level === "independent").length;
      const any = (m: CapabilityMatch[]) => m.filter((x) => x.level !== null).length;
      return pro(b.matches) - pro(a.matches) || any(b.matches) - any(a.matches) || ind(b.matches) - ind(a.matches) || a.r.availability.availableFrom.localeCompare(b.r.availability.availableFrom);
    })
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
