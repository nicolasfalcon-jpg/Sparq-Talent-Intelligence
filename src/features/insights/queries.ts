import "server-only";
import { getRepositories } from "@/data/repositories";
import { scopedTalent } from "@/data/repositories/scoped";
import { assertAllowed } from "@/domain/policy";
import type { AppUser, SkillGroup } from "@/domain/schemas";
import { aggregateInsights, GROUP_ORDER, type InsightsModel } from "./model";

export type InsightsSearchParams = { group?: string };

/**
 * Aggregate supply vs demand. AUTHORIZED: staffing leads only (`insights:read`). People are read through the scoped layer but only
 * counted: the view model contains no name, id or per-person row (see ./model.ts for the minimum-group-size rules).
 */
export async function getInsightsView(sp: InsightsSearchParams, viewer: AppUser): Promise<{ model: InsightsModel; selected: SkillGroup | null; peopleCount: number }> {
  assertAllowed(viewer, "insights:read");
  const repos = getRepositories();
  const talent = scopedTalent(repos, viewer);
  const [rows, catalogue, opportunities] = await Promise.all([talent.listPeople(), talent.listCapabilities(), repos.opportunities.list()]);
  const model = aggregateInsights(rows, opportunities, catalogue);
  const selected = (GROUP_ORDER as readonly string[]).includes(sp.group ?? "") ? (sp.group as SkillGroup) : null;
  return { model, selected, peopleCount: rows.length };
}
