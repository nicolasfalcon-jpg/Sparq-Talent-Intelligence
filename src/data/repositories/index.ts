import "server-only";
import { createMemoryRepositories } from "./memory";
import type { Repositories } from "./types";

let cached: Repositories | null = null;

/**
 * Composition root for data access. Server-only: repositories never ship to the browser.
 * SPARQ_DATA_SOURCE=memory (default) → fictional in-memory data.
 * SPARQ_DATA_SOURCE=supabase → reserved for phase 2; fails loudly instead of silently faking persistence.
 */
export function getRepositories(): Repositories {
  if (cached) return cached;
  const source = process.env.SPARQ_DATA_SOURCE ?? "memory";
  if (source === "memory") {
    cached = createMemoryRepositories();
    return cached;
  }
  throw new Error(`SPARQ_DATA_SOURCE="${source}" is not implemented yet. See docs/handoff/06-roadmap.md (phase 2: Supabase adapter).`);
}

export type { Repositories, PersonAggregate } from "./types";
