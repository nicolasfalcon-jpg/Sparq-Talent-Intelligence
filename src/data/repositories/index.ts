import "server-only";
import { dataSource } from "@/lib/data-source";
import { createMemoryRepositories } from "./memory";
import { createSupabaseRepositories } from "./supabase";
import type { Repositories } from "./types";

let cached: Repositories | null = null;

/**
 * Composition root for data access. Server-only: repositories never ship to the browser.
 * SPARQ_DATA_SOURCE=memory (default, local only) → fictional in-memory data.
 * SPARQ_DATA_SOURCE=supabase → Supabase adapter. It is a singleton whose methods obtain the REQUEST-scoped user client on every
 * call (the caller's JWT), so there is never a shared or privileged connection. A deployed environment refuses memory mode.
 */
export function getRepositories(): Repositories {
  if (cached) return cached;
  cached = dataSource() === "supabase" ? createSupabaseRepositories() : createMemoryRepositories();
  return cached;
}

export type { Repositories, PersonAggregate } from "./types";
