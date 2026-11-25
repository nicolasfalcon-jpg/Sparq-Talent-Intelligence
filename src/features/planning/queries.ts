import "server-only";
import { getRepositories } from "@/data/repositories";
import { scopedTalent } from "@/data/repositories/scoped";
import { assertAllowed } from "@/domain/policy";
import { DISCIPLINES, type AppUser, type Discipline } from "@/domain/schemas";
import { buildPlanning, clampOffset, describeBar, OFFSET_STEP_DAYS, type PlanningModel, type PlanningView } from "./model";

export type PlanningSearchParams = { view?: string; off?: string; disc?: string; sel?: string };

export type PlanningViewModel = PlanningModel & {
  discipline: Discipline | "All";
  offsetDays: number;
  step: number;
  selected: { personId: string; name: string; headline: string; kind: string; line: string; facts: { k: string; v: string }[]; pending: boolean; leadName: string | null; selKey: string } | null;
};

/**
 * Read-only planning. AUTHORIZED: staffing leads (`planning:read`). People through the scoped layer; assignments through the
 * viewer-aware planning repository (RLS in Supabase mode). Everything is derived: nothing here is stored or editable.
 */
export async function getPlanningView(sp: PlanningSearchParams, viewer: AppUser): Promise<PlanningViewModel> {
  assertAllowed(viewer, "planning:read");
  const repos = getRepositories();
  const talent = scopedTalent(repos, viewer);
  const today = repos.clock.today();
  const [rows, assignments, opportunities] = await Promise.all([talent.listPeople(), repos.planning.listAssignments(viewer), repos.opportunities.list()]);
  const view: PlanningView = sp.view === "m" ? "m" : "w";
  const offsetDays = view === "w" ? clampOffset(Number(sp.off ?? 0)) : 0;
  const discipline: Discipline | "All" = (DISCIPLINES as readonly string[]).includes(sp.disc ?? "") ? (sp.disc as Discipline) : "All";
  const model = buildPlanning({ rows, assignments, opportunities, today, view, offsetDays, discipline });

  let selected: PlanningViewModel["selected"] = null;
  if (sp.sel) {
    const personId = sp.sel.split(":")[0] ?? "";
    const row = model.rows.find((r) => r.person.id === personId);
    const agg = rows.find((r) => r.person.id === personId);
    const d = row && agg ? describeBar(row, sp.sel, agg.availability, assignments, today) : null;
    if (row && agg && d) selected = { personId, name: row.person.name, headline: row.person.headline, ...d, leadName: agg.availability.deliveryLead, selKey: sp.sel };
  }
  return { ...model, discipline, offsetDays, step: OFFSET_STEP_DAYS, selected };
}
