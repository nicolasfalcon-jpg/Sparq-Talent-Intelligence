import "server-only";
import { getRepositories } from "@/data/repositories";
import { formatLongDate, formatShortDate } from "@/domain/dates";
import { describeAvailability, groupPassportSkills, levelFor } from "@/domain/rules";
import type { SkillGroup } from "@/domain/schemas";

const NEED_LABEL: Record<SkillGroup, string> = {
  mobile: "For a mobile lead role", ai: "For an AI product", web: "For a web or API role", data: "For a data platform",
  cloud: "For a cloud migration", quality: "For a quality role", architecture: "For an architecture role",
};

export type NeedSummary = { key: string; label: string; answer: string; items: { k: string; v: string }[] };

/** Passport view-model. Used by the staff passport (/people/[id]) and the personal passport (/me/passport). */
export async function getPassportView(personId: string, viewerUserId: string | null) {
  const repos = getRepositories();
  const agg = await repos.talent.getPerson(personId);
  if (!agg) return null;
  const today = repos.clock.today();
  const [projects, catalogue, interests, shortlist] = await Promise.all([
    repos.talent.listProjects(personId), repos.talent.listCapabilities(), repos.talent.getCareerInterests(personId),
    viewerUserId ? repos.shortlists.get(viewerUserId) : Promise.resolve([] as string[]),
  ]);
  const { person, evidence, availability } = agg;
  const av = describeAvailability(availability, today);
  const groupOf = (capId: string) => catalogue.find((c) => c.id === capId)?.group;
  const first = person.name.split(" ")[0] ?? person.name;

  // Deterministic "summarize for a need" — computed from evidence, no AI involved.
  const groupsByWeight = Object.entries(
    evidence.reduce<Record<string, number>>((acc, e) => { const g = groupOf(e.capabilityId); if (g) acc[g] = (acc[g] ?? 0) + 1; return acc; }, {}),
  ).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g as SkillGroup);
  const needs: NeedSummary[] = groupsByWeight.map((g) => {
    const ev = evidence.filter((e) => groupOf(e.capabilityId) === g);
    const pro = ev.filter((e) => e.level === "professional");
    const other = ev.filter((e) => e.level !== "professional" && levelFor(evidence, e.capabilityId) !== "professional");
    const answer = pro.length
      ? `${first} has professional evidence in ${pro.slice(0, 3).map((e) => e.label).join(", ")}${other.length ? `, plus ${other.map((e) => `${e.label.toLowerCase()} (${e.level})`).slice(0, 2).join(" and ")}` : ""}.`
      : `${first}’s ${g === "ai" ? "AI" : g} experience is emerging: ${other.map((e) => `${e.label} (${e.level})`).join(", ")}. No professional project is documented yet.`;
    return { key: g, label: NEED_LABEL[g], answer, items: ev.slice(0, 3).map((e) => ({ k: e.label, v: `${e.detail} · ${e.level}` })) };
  });

  return {
    person,
    first,
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
    interestsAll: interests?.interests ?? {},
    interestsOn: Object.entries(interests?.interests ?? {}).filter(([, on]) => on).map(([k]) => k),
    onShortlist: shortlist.includes(personId),
    generatedOn: formatShortDate(today) + ", " + today.slice(0, 4),
  };
}

export type PassportView = NonNullable<Awaited<ReturnType<typeof getPassportView>>>;
