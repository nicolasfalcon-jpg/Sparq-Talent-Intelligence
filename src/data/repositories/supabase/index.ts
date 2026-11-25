import { DEMO_TODAY } from "@/data/fixtures/organization";
import type { Clock, Repositories } from "../types";
import type { Db } from "./db";
import { createDirectoryRepository } from "./directory";
import { createProposalRepository } from "./proposals";
import { createInterestRepository, createOpportunityRepository, createPlanningRepository, createShortlistRepository } from "./staffing";
import { createTalentRepository } from "./talent";

/**
 * Business "today". The fictional dataset is built around DEMO_TODAY (2026-11-24: availability, kick-offs, assignments), so the
 * Supabase adapter uses it too, unless SPARQ_TODAY=YYYY-MM-DD says otherwise. Set SPARQ_TODAY to the real date once the data is real.
 */
export function createClock(env: Record<string, string | undefined> = process.env): Clock {
  const v = env.SPARQ_TODAY;
  const today = v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : DEMO_TODAY;
  return { today: () => today };
}

/** `getDb` is called by EVERY repository method: each call obtains the request-scoped, user-JWT client (see src/lib/supabase/server.ts). */
export function createRepositoriesWith(getDb: () => Promise<Db>, clock: Clock = createClock()): Repositories {
  return {
    clock,
    talent: createTalentRepository(getDb, clock.today),
    opportunities: createOpportunityRepository(getDb),
    shortlists: createShortlistRepository(getDb),
    directory: createDirectoryRepository(getDb),
    proposals: createProposalRepository(getDb),
    planning: createPlanningRepository(getDb),
    interests: createInterestRepository(getDb),
  };
}
