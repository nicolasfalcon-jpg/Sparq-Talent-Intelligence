import "server-only";
import { getRepositories } from "@/data/repositories";
import { scopedTalent } from "@/data/repositories/scoped";
import { assertAllowed } from "@/domain/policy";
import type { AppUser } from "@/domain/schemas";
import { buildCompare, parseCompareIds, COMPARE_MAX, type CompareModel } from "./model";

export type CompareSearchParams = { ids?: string; caps?: string; opp?: string; role?: string; from?: string };

/** Where the "← back" link goes. Only these values are honoured, so the URL can never send the visitor elsewhere. */
const BACK: Record<string, { href: string; label: string }> = {
  people: { href: "/people", label: "People" },
  role: { href: "/opportunities/new/role", label: "Fill a role" },
  team: { href: "/opportunities/new/team", label: "Build a team" },
  opps: { href: "/opportunities", label: "Opportunities" },
};

export type CompareView = CompareModel & {
  back: { href: string; label: string };
  roleTitle: string | null;
  /** Staff-visible people who could be added (documented experience in at least one requirement), alphabetical, not ranked. */
  addable: { id: string; name: string }[];
  shortlist: string[];
  max: number;
  idsParam: string;
};

/**
 * Read-only comparison. AUTHORIZED: staffing leads (`planning:read`). People are read through the scoped layer. Requirements come
 * from `?caps=` (capability names), or from a role of an opportunity (`?role=<role id>` with an optional `?opp=`), otherwise from
 * the compared people's own top skills. At most three profiles; the order is the one in the URL.
 */
export async function getCompareView(sp: CompareSearchParams, viewer: AppUser): Promise<CompareView> {
  assertAllowed(viewer, "planning:read");
  const repos = getRepositories();
  const talent = scopedTalent(repos, viewer);
  const today = repos.clock.today();
  const { ids, truncated } = parseCompareIds(sp.ids);
  const [all, catalogue, opportunities, shortlist] = await Promise.all([talent.listPeople(), talent.listCapabilities(), repos.opportunities.list(), repos.shortlists.get(viewer.id)]);
  const byId = new Map(all.map((r) => [r.person.id, r]));
  const rows = ids.map((id) => byId.get(id)).filter((r) => r !== undefined);

  const roleHit = sp.role ? opportunities.flatMap((o) => o.roles.map((r) => ({ o, r }))).find(({ o, r }) => r.id === sp.role && (!sp.opp || o.id === sp.opp)) : undefined;
  const oppHit = roleHit?.o ?? opportunities.find((o) => o.id === sp.opp);
  const fromCaps = (sp.caps ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const requirements = fromCaps.length ? fromCaps : roleHit ? roleHit.r.capabilities : rows.flatMap((r) => r.person.topSkills);

  const projects = Object.fromEntries(await Promise.all(rows.map(async (r) => [r.person.id, await talent.listProjects(r.person.id)] as const)));
  const model = buildCompare({
    rows, requirements: requirements.slice(0, 8), catalogue, today, projects, truncated,
    opportunity: oppHit ? { id: oppHit.id, client: oppHit.client, kickoff: oppHit.kickoff } : null,
    opportunityName: (id) => opportunities.find((o) => o.id === id)?.client ?? null,
  });
  const addable = all.filter((r) => !ids.includes(r.person.id) && model.requirements.some((q) => {
    const cap = catalogue.find((c) => c.name.toLowerCase() === q.toLowerCase() || c.aliases.some((a) => a.toLowerCase() === q.toLowerCase()));
    return cap && r.evidence.some((e) => e.capabilityId === cap.id);
  })).map((r) => ({ id: r.person.id, name: r.person.name })).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 6);

  return { ...model, back: BACK[sp.from ?? ""] ?? BACK.people!, roleTitle: roleHit?.r.title ?? null, addable, shortlist, max: COMPARE_MAX, idsParam: rows.map((r) => r.person.id).join(",") };
}
