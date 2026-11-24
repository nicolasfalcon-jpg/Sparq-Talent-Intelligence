import { afterEach, beforeAll, beforeEach } from "vitest";
import { createDb, type Q, type TestDb } from "./harness";

/** One migrated + seeded database per test FILE; every test runs in a transaction that is rolled back. */
export function withDb() {
  const ref = {} as { db: TestDb };
  beforeAll(async () => { ref.db = await createDb(); });
  beforeEach(() => ref.db.begin());
  afterEach(() => ref.db.rollback());
  return ref;
}

export const count = async (q: Q, from: string, where = "true", params: unknown[] = []): Promise<number> =>
  Number((await q(`select count(*)::int as n from ${from} where ${where}`, params))[0]!.n);

/** Expect a refused statement and return its message (the caller asserts on it). */
export function denied(r: { ok: boolean; error?: string }): string {
  if (r.ok) throw new Error("expected the statement to be refused, but it succeeded");
  return r.error ?? "";
}


/** Run one statement as `who` and report whether it was refused (permission, RLS violation, trigger or rule) or what it returned. */
export const tryAs = (db: TestDb, who: string, sql: string, params?: unknown[]) => db.attempt(() => db.as(who, (q) => q(sql, params)));

/** The rows a user can see: the main way to prove an access rule. */
export const seen = (db: TestDb, who: string, sql: string, params?: unknown[]) => db.as(who, (q) => q(sql, params));
