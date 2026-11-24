import "server-only";
import { getRepositories } from "@/data/repositories";
import { endOfMonth, parseIsoDate } from "@/domain/dates";
import { applyPeopleFilters, describeAvailability, interpretQuery, matchPeople, type CapabilityMatch } from "@/domain/rules";
import { DISCIPLINES, type Discipline } from "@/domain/schemas";

export type PeopleSearchParams = { q?: string; caps?: string; disc?: string; soon?: string; sel?: string };

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Available by <month>" — the end of the month after next (Nov 24 → January 31), as in V4.2. */
export function soonCutoff(today: string): { iso: string; label: string } {
  const d = parseIsoDate(today);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 1));
  const iso = endOfMonth(target.toISOString().slice(0, 10));
  return { iso, label: `Available by ${MONTHS_LONG[target.getUTCMonth()]}` };
}

export async function getPeopleView(sp: PeopleSearchParams, ownerUserId: string) {
  const repos = getRepositories();
  const today = repos.clock.today();
  const [rows, catalogue, shortlist] = await Promise.all([repos.talent.listPeople(), repos.talent.listCapabilities(), repos.shortlists.get(ownerUserId)]);

  const q = (sp.q ?? "").trim();
  const searched = q.length > 0;
  // Criteria come from explicit `caps` (after a chip was removed) or from interpreting `q`.
  const interpreted = searched ? interpretQuery(q, catalogue) : [];
  const requested = sp.caps !== undefined
    ? sp.caps.split(",").filter(Boolean).map((id) => catalogue.find((c) => c.id === id)).filter((c) => c !== undefined)
    : interpreted;

  const discipline: Discipline | "All" = (DISCIPLINES as readonly string[]).includes(sp.disc ?? "") ? (sp.disc as Discipline) : "All";
  const soon = soonCutoff(today);
  const filtered = applyPeopleFilters(rows, { discipline, availableBy: sp.soon === "1" ? soon.iso : null });

  let ordered: { id: string; matches: CapabilityMatch[] }[];
  if (searched && requested.length > 0) ordered = matchPeople(requested, filtered).map((m) => ({ id: m.personId, matches: m.matches }));
  else ordered = filtered.map((r) => ({ id: r.person.id, matches: [] }));

  const byId = new Map(rows.map((r) => [r.person.id, r]));
  const cards = ordered.map(({ id, matches }) => {
    const r = byId.get(id)!;
    return { person: r.person, availability: describeAvailability(r.availability, today), matches };
  });

  const selRow = sp.sel ? byId.get(sp.sel) : undefined;
  const selected = selRow ? {
    person: selRow.person,
    availability: describeAvailability(selRow.availability, today),
    evidence: selRow.evidence.filter((e) => e.level === "professional").slice(0, 3).concat(selRow.evidence.filter((e) => e.level !== "professional")).slice(0, 3),
    projects: (await repos.talent.listProjects(selRow.person.id)).map((p) => `${p.client} · ${p.period.replace(/\s/g, "")}`),
    onShortlist: shortlist.includes(selRow.person.id),
  } : null;

  return {
    total: rows.length,
    q, searched, unmatchedQuery: searched && requested.length === 0 && sp.caps === undefined,
    criteria: requested.map((c) => ({ id: c.id, name: c.name })),
    discipline, soonOn: sp.soon === "1", soonLabel: soon.label,
    cards, selected,
  };
}
