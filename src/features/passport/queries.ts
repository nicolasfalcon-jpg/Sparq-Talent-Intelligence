import "server-only";
import { getRepositories } from "@/data/repositories";
import { scopedTalent } from "@/data/repositories/scoped";
import { formatLongDate, formatShortDate } from "@/domain/dates";
import { describeAvailability, groupPassportSkills, sourceWord, VERIFICATION_LABEL } from "@/domain/rules";
import { assertAllowed, type Actor } from "@/domain/policy";
import type { AppUser, SkillEvidence, SkillGroup } from "@/domain/schemas";

const NEED_LABEL: Record<SkillGroup, string> = {
  mobile: "For a mobile lead role", ai: "For an AI product", web: "For a web or API role", data: "For a data platform",
  cloud: "For a cloud migration", quality: "For a quality role", architecture: "For an architecture role",
};

export type NeedSummary = { key: string; label: string; answer: string; items: { k: string; v: string }[] };

const list = (rows: SkillEvidence[], max = 3) => rows.slice(0, max).map((e) => e.label).join(", ");

/**
 * Deterministic "summarize for a need", computed from evidence, no AI involved. Source and verification are kept apart:
 * the sentence only calls experience "verified" when a reviewer confirmed it, and says out loud when it is self-reported.
 */
function needAnswer(first: string, group: SkillGroup, ev: SkillEvidence[]): string {
  const professional = ev.filter((e) => e.level === "professional");
  const verifiedPro = professional.filter((e) => e.verification === "verified");
  const unconfirmedPro = professional.filter((e) => e.verification !== "verified");
  const coveredByVerifiedPro = new Set(verifiedPro.map((e) => e.capabilityId));
  const other = ev.filter((e) => e.level !== "professional" && !coveredByVerifiedPro.has(e.capabilityId));
  const otherText = other.length ? `, plus ${other.map((e) => `${e.label.toLowerCase()} (${sourceWord(e.level)}${e.verification === "verified" ? "" : `, ${VERIFICATION_LABEL[e.verification]}`})`).slice(0, 2).join(" and ")}` : "";
  if (verifiedPro.length) {
    const pending = unconfirmedPro.length ? ` ${list(unconfirmedPro)} ${unconfirmedPro.length === 1 ? "is" : "are"} not confirmed yet (${VERIFICATION_LABEL[unconfirmedPro[0]!.verification]}).` : "";
    return `${first} has verified professional experience in ${list(verifiedPro)}${otherText}.${pending}`;
  }
  if (unconfirmedPro.length) {
    return `${first} reports professional experience in ${list(unconfirmedPro)}, which a delivery lead has not confirmed yet${otherText}.`;
  }
  return `${first}’s ${group === "ai" ? "AI" : group} experience is emerging: ${other.map((e) => `${e.label} (${sourceWord(e.level)})`).join(", ")}. No professional project is documented yet.`;
}

/**
 * Passport view-model for the staff passport (/people/[id]) and the personal passport (/me/passport).
 * AUTHORIZED and PRIVACY-SCOPED: it throws ForbiddenError when the viewer may not read this passport, and it only ever
 * selects the career interests and preferences this viewer may see (the result is serialized to client components).
 */
export async function getPassportView(personId: string, viewer: AppUser) {
  const repos = getRepositories();
  const talent = scopedTalent(repos, viewer);
  const agg = await talent.getPerson(personId); // asserts passport:read, redacts private preferences
  if (!agg) return null;
  const today = repos.clock.today();
  const isStaff = viewer.role === "staffing_lead";
  const [projects, catalogue, interests, shortlist] = await Promise.all([
    talent.listProjects(personId), talent.listCapabilities(), talent.getInterests(personId),
    isStaff ? repos.shortlists.get(viewer.id) : Promise.resolve([] as string[]),
  ]);
  const { person, evidence, availability } = agg;
  const av = describeAvailability(availability, today);
  const groupOf = (capId: string) => catalogue.find((c) => c.id === capId)?.group;
  const first = person.name.split(" ")[0] ?? person.name;

  const groupsByWeight = Object.entries(
    evidence.reduce<Record<string, number>>((acc, e) => { const g = groupOf(e.capabilityId); if (g) acc[g] = (acc[g] ?? 0) + 1; return acc; }, {}),
  ).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g as SkillGroup);
  const needs: NeedSummary[] = groupsByWeight.map((g) => {
    const ev = evidence.filter((e) => groupOf(e.capabilityId) === g);
    return {
      key: g, label: NEED_LABEL[g], answer: needAnswer(first, g, ev),
      items: ev.slice(0, 3).map((e) => ({ k: e.label, v: `${e.detail} · ${sourceWord(e.level)} · ${VERIFICATION_LABEL[e.verification]}` })),
    };
  });

  return {
    person,
    first,
    isOwner: interests.isOwner,
    availability: {
      ...av,
      headline: av.isNow ? "Available now" : `From ${formatLongDate(availability.availableFrom)}`,
      detail: `${av.statusLabel}${availability.currentProject && availability.currentProjectEnds ? ` · on ${availability.currentProject} until ${formatShortDate(availability.currentProjectEnds)}` : " · not on a project"}`,
      longDate: formatLongDate(availability.availableFrom),
    },
    meta: [
      [person.location, person.country].filter(Boolean).join(", "),
      `${person.yearsExperience} years`,
      person.atSparqSince ? `At Sparq since ${person.atSparqSince}` : null,
      person.languages.length ? person.languages.join(" · ") : null,
    ].filter((x): x is string => Boolean(x)),
    groups: groupPassportSkills(person, evidence, catalogue),
    evidence,
    projects,
    needs,
    /** Owner only (empty for staffing): every interest label and whether it is selected. */
    interestsAll: interests.all,
    /** Labels this viewer may see: the owner's selected interests, or only what the owner shared with staffing. */
    interestsOn: interests.visible,
    /** Owner only: which selected interests are currently shared with staffing. */
    interestsShared: interests.shared,
    /** Professional preferences, present only if the viewer may see them (owner, or shared by the owner). */
    workPreferences: person.workPreferences ?? null,
    workPreferencesShared: !!person.workPreferencesShared,
    onShortlist: shortlist.includes(personId),
    generatedOn: formatShortDate(today) + ", " + today.slice(0, 4),
  };
}

export type PassportView = NonNullable<Awaited<ReturnType<typeof getPassportView>>>;

/** Page title for /people/[id]. Goes through the same authorization as the page, so a name never leaks via metadata. */
export async function getPassportTitle(personId: string, viewer: Actor): Promise<string> {
  assertAllowed(viewer, "passport:read", { personId });
  const agg = await scopedTalent(getRepositories(), viewer).getPerson(personId);
  return agg ? `${agg.person.name} · Talent Passport` : "Talent Passport";
}
