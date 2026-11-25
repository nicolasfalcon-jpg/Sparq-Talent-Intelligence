/**
 * My Space view-model (engineer's home). Pure, computed only from the person's OWN data.
 *
 * - "Opportunities that fit you" explains WHY each role is shown, from the person's documented skills and their own (private)
 *   interests. The reasons are for the person only; they never reach staffing.
 * - The passport checklist is a qualitative content hint about the PASSPORT, never a measure of the person: it has no
 *   percentage and no score.
 */
import { formatLongDate, formatShortDate } from "@/domain/dates";
import { resolveCapability } from "@/domain/proposals";
import { bestEvidence, sourceWord } from "@/domain/rules";
import type { Assignment, Availability, Capability, ExpressionOfInterest, Opportunity, Person, SkillEvidence } from "@/domain/schemas";

export type NowCard = { project: string; role: string | null; until: string | null; allocationNote: string | null } | null;
export type NextCard = { headline: string; detail: string };
export type ChecklistItem = { key: string; label: string; done: boolean; hint: string };
export type FitRole = {
  opportunityId: string; client: string; opportunityName: string; description: string;
  startsLabel: string; durationMonths: number;
  roleId: string; roleTitle: string;
  reasons: { skills: string[]; interests: string[] };
  shared: boolean;
};
export type SharedInterest = { roleRequirementId: string; client: string; roleTitle: string; sharedOn: string };

export type MeModel = {
  firstName: string;
  now: NowCard;
  next: NextCard;
  checklist: ChecklistItem[];
  checklistDone: number;
  fits: FitRole[];
  shared: SharedInterest[];
};

const MAX_FITS = 6;

export function buildMe(input: {
  person: Person;
  evidence: SkillEvidence[];
  availability: Availability;
  assignments: Assignment[];
  projectCount: number;
  /** The owner's own selected interest labels. */
  ownInterests: string[];
  published: Opportunity[];
  /** Opportunities the viewer can read, used only to NAME already-shared interests (may include ones no longer published). */
  known?: Opportunity[];
  eois: ExpressionOfInterest[];
  catalogue: Capability[];
  today: string;
}): MeModel {
  const { person, evidence, availability, today } = input;
  const mine = input.assignments.filter((a) => a.personId === person.id);
  const current = mine.filter((a) => a.startsOn <= today && (a.availableFrom ?? "9999-12-31") > today).sort((a, b) => (b.endsOn ?? "9999").localeCompare(a.endsOn ?? "9999"))[0];
  const upcoming = mine.filter((a) => a.startsOn > today).sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0];

  const now: NowCard = current
    ? { project: current.projectName, role: null, until: current.endsOn ? formatLongDate(current.endsOn) : null, allocationNote: current.allocation < 1 ? `${Math.round(current.allocation * 100)}% of full-time` : null }
    : availability.currentProject ? { project: availability.currentProject, role: null, until: availability.currentProjectEnds ? formatLongDate(availability.currentProjectEnds) : null, allocationNote: null } : null;

  let next: NextCard;
  if (upcoming) next = { headline: `${upcoming.projectName} starts ${formatShortDate(upcoming.startsOn)}`, detail: `Confirmed by ${upcoming.deliveryLeadName}. Proposals are not assignments: this one was confirmed.` };
  else if (availability.availableFrom <= today) next = { headline: "Free now", detail: "Staffing leads can see that you are available." };
  else next = { headline: `Free from ${formatShortDate(availability.availableFrom)}`, detail: availability.status === "confirmed" ? `Confirmed${availability.deliveryLead ? ` by ${availability.deliveryLead}` : ""}.` : "Not confirmed yet: your delivery lead will confirm the end date." };

  const distinctSkills = new Set(evidence.map((e) => e.capabilityId)).size;
  const checklist: ChecklistItem[] = [
    { key: "summary", label: "A summary in your own words", done: person.summary.trim().length >= 20, hint: "Two or three sentences about the work you do." },
    { key: "skills", label: "At least three documented skills", done: distinctSkills >= 3, hint: "Add the skills you actually use." },
    { key: "projects", label: "At least one project described", done: input.projectCount >= 1, hint: "Say what you did and what changed." },
    { key: "confirmed", label: "A skill confirmed by a delivery lead", done: evidence.some((e) => e.verification === "verified"), hint: "Ask a delivery lead to confirm what they have seen you do." },
    { key: "interests", label: "Areas you want to grow into", done: input.ownInterests.length > 0, hint: "Private unless you choose to share them." },
  ];

  const interestsLower = input.ownInterests.map((i) => i.toLowerCase());
  const eoiByRole = new Map(input.eois.filter((e) => e.status === "shared").map((e) => [e.roleRequirementId, e]));
  const fits: FitRole[] = [];
  for (const o of input.published) {
    for (const r of o.roles) {
      const skills = r.capabilities.flatMap((label) => {
        const cap = resolveCapability(label, input.catalogue);
        const best = cap ? bestEvidence(evidence, cap.id) : null;
        return best ? [`${label} (${sourceWord(best.level)})`] : [];
      });
      const haystack = [...r.capabilities, ...o.capabilities, r.title, o.name, o.industry].join(" | ").toLowerCase();
      const interests = input.ownInterests.filter((_, i) => haystack.includes(interestsLower[i]!) || interestsLower[i]!.split(/[^a-z0-9]+/).filter((w) => w.length > 4).some((w) => haystack.includes(w)));
      if (skills.length === 0 && interests.length === 0) continue;
      fits.push({
        opportunityId: o.id, client: o.client, opportunityName: o.name, description: o.short || o.description, startsLabel: formatShortDate(o.kickoff), durationMonths: o.durationMonths,
        roleId: r.id, roleTitle: r.title, reasons: { skills, interests }, shared: eoiByRole.has(r.id),
      });
    }
  }
  // Order: stated interest first, then number of documented skills, then client name (a neutral tie-break). Not a score shown to anyone.
  fits.sort((a, b) => b.reasons.interests.length - a.reasons.interests.length || b.reasons.skills.length - a.reasons.skills.length || a.client.localeCompare(b.client) || a.roleTitle.localeCompare(b.roleTitle));

  const roleIndex = new Map([...(input.known ?? []), ...input.published].flatMap((o) => o.roles.map((r) => [r.id, { client: o.client, title: r.title }] as const)));
  const shared: SharedInterest[] = [...eoiByRole.values()].map((e) => ({ roleRequirementId: e.roleRequirementId, client: roleIndex.get(e.roleRequirementId)?.client ?? "An opportunity", roleTitle: roleIndex.get(e.roleRequirementId)?.title ?? "a role", sharedOn: e.createdAt.slice(0, 10) }));

  return { firstName: person.name.split(" ")[0] ?? person.name, now, next, checklist, checklistDone: checklist.filter((c) => c.done).length, fits: fits.slice(0, MAX_FITS), shared };
}
