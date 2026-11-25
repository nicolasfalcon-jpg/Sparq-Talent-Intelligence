/**
 * Basic Insights: aggregate capability SUPPLY (people with documented experience) against open-seat DEMAND.
 *
 * PRIVACY RULES (pure, unit-tested):
 *  - Aggregates only: no names, no ids, no per-person rows, no scores.
 *  - MINIMUM GROUP SIZE: a supply number is shown only when it counts at least `minGroup` (3) people, so a small group can
 *    never point at an individual. 1 or 2 people are reported as "fewer than 3", never as the number.
 *  - The split by evidence basis is shown only when every non-empty part is itself at least `minGroup`; otherwise only the
 *    total is shown (no complementary disclosure of a small part by subtraction).
 *  - 0 is shown as 0: "not documented in any passport" is a statement about documentation, never about ability.
 * Demand counts are about roles, not people, and are always shown.
 */
import { evidenceBasis, bestEvidence, type EvidenceBasis } from "@/domain/rules";
import { resolveCapability } from "@/domain/proposals";
import type { Capability, Opportunity, Person, SkillEvidence, SkillGroup } from "@/domain/schemas";

export const MIN_GROUP = 3;

export const GROUP_LABEL: Record<SkillGroup, string> = {
  mobile: "Mobile", web: "Web and APIs", ai: "Artificial intelligence", data: "Data", cloud: "Cloud and DevOps", quality: "Quality engineering", architecture: "Architecture",
};
export const GROUP_ORDER: readonly SkillGroup[] = ["mobile", "web", "ai", "data", "cloud", "quality", "architecture"];

export type SupplySplit = { verifiedPractical: number; needsConfirmation: number; learning: number };
export type Supply =
  /** At least `minGroup` people, or zero. `split` is null when a part is too small to show. */
  | { shown: true; total: number; split: SupplySplit | null }
  | { shown: false; reason: string };

export type CapabilityInsight = { id: string; name: string; supply: Supply; demand: number };
export type GroupInsight = { group: SkillGroup; label: string; supply: Supply; demand: number; capabilities: CapabilityInsight[] };
export type InsightsModel = {
  minGroup: number;
  openRoles: number;
  groups: GroupInsight[];
  /** Open-role requirements that are not in the skills catalogue (counted, never matched to anyone). */
  uncatalogued: { label: string; demand: number }[];
};

const RANK: Record<EvidenceBasis, number> = { verified_practical: 3, unverified_practical: 2, learning: 1 };

function supplyOf(bases: EvidenceBasis[], minGroup: number): Supply {
  const total = bases.length;
  if (total > 0 && total < minGroup) return { shown: false, reason: `Fewer than ${minGroup} people: not shown` };
  const parts: SupplySplit = {
    verifiedPractical: bases.filter((b) => b === "verified_practical").length,
    needsConfirmation: bases.filter((b) => b === "unverified_practical").length,
    learning: bases.filter((b) => b === "learning").length,
  };
  const showSplit = Object.values(parts).every((n) => n === 0 || n >= minGroup);
  return { shown: true, total, split: total > 0 && showSplit ? parts : null };
}

export function aggregateInsights(
  rows: { person: Pick<Person, "id">; evidence: SkillEvidence[] }[],
  opportunities: Pick<Opportunity, "roles">[],
  catalogue: Capability[],
  minGroup: number = MIN_GROUP,
): InsightsModel {
  // Best evidence basis per person per capability.
  const basisByPerson = rows.map((r) => {
    const m = new Map<string, EvidenceBasis>();
    for (const c of catalogue) {
      const best = bestEvidence(r.evidence, c.id);
      if (best) m.set(c.id, evidenceBasis(best));
    }
    return m;
  });

  // Demand: open seats (roles nobody is proposed for), counted per requirement and once per group.
  const open = opportunities.flatMap((o) => o.roles.filter((r) => !r.proposedPersonId));
  const demandByCap = new Map<string, number>();
  const demandByGroup = new Map<SkillGroup, number>();
  const uncat = new Map<string, number>();
  for (const role of open) {
    const caps = new Map<string, Capability>();
    for (const label of role.capabilities) {
      const cap = resolveCapability(label, catalogue);
      if (cap) caps.set(cap.id, cap);
      else uncat.set(label, (uncat.get(label) ?? 0) + 1);
    }
    for (const c of caps.values()) demandByCap.set(c.id, (demandByCap.get(c.id) ?? 0) + 1);
    for (const g of new Set([...caps.values()].map((c) => c.group))) demandByGroup.set(g, (demandByGroup.get(g) ?? 0) + 1);
  }

  const groups: GroupInsight[] = GROUP_ORDER.map((group) => {
    const inGroup = catalogue.filter((c) => c.group === group);
    const groupBases = basisByPerson.flatMap((m) => {
      const bs = inGroup.map((c) => m.get(c.id)).filter((b): b is EvidenceBasis => !!b);
      return bs.length ? [bs.reduce((a, b) => (RANK[b] > RANK[a] ? b : a))] : [];
    });
    const capabilities = inGroup
      .map((c): CapabilityInsight => ({ id: c.id, name: c.name, supply: supplyOf(basisByPerson.flatMap((m) => (m.has(c.id) ? [m.get(c.id)!] : [])), minGroup), demand: demandByCap.get(c.id) ?? 0 }))
      .sort((a, b) => b.demand - a.demand || a.name.localeCompare(b.name));
    return { group, label: GROUP_LABEL[group], supply: supplyOf(groupBases, minGroup), demand: demandByGroup.get(group) ?? 0, capabilities };
  });

  return { minGroup, openRoles: open.length, groups, uncatalogued: [...uncat].map(([label, demand]) => ({ label, demand })).sort((a, b) => b.demand - a.demand || a.label.localeCompare(b.label)) };
}
