/**
 * Disposable-database harness. Applies the real migrations (and the real seed) to an in-process PostgreSQL (PGlite) and lets a test act
 * as a given user under the same role model Supabase uses: the API role is `authenticated` (or `anon`), the user id travels in the
 * JWT claims that `auth.uid()` reads, and RLS, column grants and triggers are the real PostgreSQL ones.
 *
 * What this is NOT: Supabase itself. There is no PostgREST (so no HTTP layer, no schema exposure rules) and no GoTrue. See
 * docs/handoff/08-authorization-and-evidence.md for what that leaves unverified.
 */
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(__dirname, "..", "..");
export const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
export const BOOTSTRAP_SQL = join(__dirname, "bootstrap.sql");
export const SEED_SQL = join(ROOT, "supabase", "seed.sql");

export const migrationFiles = (): string[] => readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
export const sha256 = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");

export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Q = (sql: string, params?: unknown[]) => Promise<Row[]>;
export type Attempt<T> = { ok: true; value: T } | { ok: false; error: string; code?: string };

export class TestDb {
  constructor(readonly pg: PGlite) {}

  /** As the database owner (postgres): migrations, seed, fixtures for a test, and catalog inspection. RLS does not apply. */
  sql: Q = async (sql, params) => (await this.pg.query(sql, params)).rows as Row[];
  exec = (sql: string) => this.pg.exec(sql);

  /**
   * Run as an API role. `who` is a user uuid (role `authenticated`), "anon" or "service_role". `extraClaims` are merged into the JWT, which
   * lets a test forge claims (e.g. an `app_metadata.role` of "admin") to prove they grant nothing. Always restores the owner role.
   */
  async as<T>(who: string, fn: (q: Q) => Promise<T>, extraClaims: Record<string, unknown> = {}): Promise<T> {
    const apiRole = who === "anon" || who === "service_role" ? who : "authenticated";
    const claims = { ...extraClaims, ...(apiRole === "authenticated" ? { sub: who } : {}), role: apiRole };
    await this.pg.query("select set_config('request.jwt.claims', $1, false), set_config('request.jwt.claim.sub', $2, false), set_config('request.jwt.claim.role', $3, false)", [
      JSON.stringify(claims), apiRole === "authenticated" ? who : "", apiRole,
    ]);
    await this.pg.exec(`set role ${apiRole}`);
    let result: T | undefined;
    let failure: unknown;
    let failed = false;
    try {
      result = await fn(this.sql);
    } catch (e) {
      failed = true;
      failure = e;
    }
    try {
      await this.pg.exec("reset role");
      await this.pg.exec("select set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false)");
    } catch {
      // The failed statement aborted the transaction. ROLLBACK TO SAVEPOINT in attempt() restores the role and the claims (SET is transactional).
    }
    if (failed) throw failure;
    return result as T;
  }

  /** Runs `fn` inside a savepoint so a refused statement does not poison the surrounding test transaction. */
  async attempt<T>(fn: () => Promise<T>): Promise<Attempt<T>> {
    await this.pg.exec("savepoint attempt_sp");
    try {
      const value = await fn();
      await this.pg.exec("release savepoint attempt_sp");
      return { ok: true, value };
    } catch (e) {
      await this.pg.exec("rollback to savepoint attempt_sp");
      await this.pg.exec("release savepoint attempt_sp");
      const err = e as { message?: string; code?: string };
      return { ok: false, error: String(err.message ?? e), code: err.code };
    }
  }

  begin = () => this.pg.exec("begin");
  rollback = () => this.pg.exec("rollback");
}

export async function createDb(opts: { migrations?: number | "all"; seed?: boolean } = {}): Promise<TestDb> {
  const db = new TestDb(new PGlite());
  await db.exec(readFileSync(BOOTSTRAP_SQL, "utf8"));
  const files = migrationFiles();
  const upTo = opts.migrations === undefined || opts.migrations === "all" ? files.length : opts.migrations;
  for (const f of files.slice(0, upTo)) await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
  if (opts.seed !== false && upTo === files.length) await db.exec(readFileSync(SEED_SQL, "utf8"));
  return db;
}
