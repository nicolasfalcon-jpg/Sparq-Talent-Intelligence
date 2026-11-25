/**
 * The minimal structural slice of the Supabase client the adapter uses. The real `SupabaseClient` satisfies it (cast once, in
 * `index.ts`); unit tests implement it with a fake. Keeping it narrow also documents exactly which PostgREST features the
 * adapter relies on: explicit column lists, filters, ordering, embedding, and RPC.
 */
import { DomainRuleError, ForbiddenError, InvalidRequestError, NotFoundError, UnauthenticatedError } from "@/domain/errors";

export type PgError = { code?: string; message?: string; details?: string | null; hint?: string | null } | null;
export type QueryResult = { data: unknown; error: PgError };

export interface QueryBuilder extends PromiseLike<QueryResult> {
  select(columns?: string): QueryBuilder;
  insert(values: unknown): QueryBuilder;
  update(values: unknown): QueryBuilder;
  delete(): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  in(column: string, values: readonly unknown[]): QueryBuilder;
  order(column: string, options?: { ascending?: boolean; referencedTable?: string }): QueryBuilder;
  limit(count: number): QueryBuilder;
  maybeSingle(): QueryBuilder;
  single(): QueryBuilder;
}

export interface Db {
  from(table: string): QueryBuilder;
  rpc(fn: string, args?: Record<string, unknown>): QueryBuilder;
}

export type Row = Record<string, unknown>;

/** Await a query and return its rows. Errors are mapped to typed domain errors; never leaks raw Postgres messages for denials. */
export async function rows(q: PromiseLike<QueryResult>): Promise<Row[]> {
  const { data, error } = await q;
  if (error) throw mapPgError(error);
  if (data == null) return [];
  return (Array.isArray(data) ? data : [data]) as Row[];
}

/** Like `rows` for `.maybeSingle()` / `.single()`: the row or null. */
export async function row(q: PromiseLike<QueryResult>): Promise<Row | null> {
  const { data, error } = await q;
  if (error) throw mapPgError(error);
  return (data ?? null) as Row | null;
}

/** An RPC result (scalar, object or null). */
export async function rpcValue(q: PromiseLike<QueryResult>): Promise<unknown> {
  const { data, error } = await q;
  if (error) throw mapPgError(error);
  return data ?? null;
}

const INTERNAL_DENIAL = /^(permission denied|new row violates row-level security|new row for relation .* violates row-level security)/i;

/**
 * Postgres / PostgREST error → typed domain error.
 *   42501 (insufficient privilege, RLS, function checks) → ForbiddenError (internal wording replaced; our own function messages kept)
 *   PGRST301 / PGRST302 / JWT problems / HTTP 401 → UnauthenticatedError
 *   P0002, PGRST116 (no rows) → NotFoundError
 *   55000 → invalid transition · 23514 capacity | check → DomainRuleError · 23505 unique · 23502/23503/22xxx → invalid input
 */
export function mapPgError(error: NonNullable<PgError>): Error {
  const code = error.code ?? "";
  const message = error.message ?? "Database error";
  if (code === "42501") return new ForbiddenError(INTERNAL_DENIAL.test(message) ? "You are not allowed to do that." : message);
  if (code === "PGRST301" || code === "PGRST302" || /jwt/i.test(message) && code.startsWith("PGRST")) return new UnauthenticatedError("Your session has ended.");
  if (code === "P0002" || code === "PGRST116") return new NotFoundError(message);
  if (code === "55000") return new DomainRuleError("invalid_transition", message);
  if (code === "23514") return /capacity|allocation/i.test(message) ? new DomainRuleError("capacity_exceeded", message) : new DomainRuleError("invalid_input", message);
  if (code === "23505") {
    if (/skill_evidence_unique_claim/.test(message + (error.details ?? ""))) return new DomainRuleError("duplicate_evidence", "That skill is already documented.");
    if (/proposal_seats_one_per_person/.test(message + (error.details ?? ""))) return new DomainRuleError("duplicate_person", "A person can occupy only one seat of a proposal.");
    if (/already confirmed/i.test(message)) return new DomainRuleError("seat_already_confirmed", message);
    return new DomainRuleError("already_exists", "That already exists.");
  }
  if (code === "22004") return new DomainRuleError("invalid_dates", message);
  if (code === "23502" || code === "23503" || code === "23P01" || code.startsWith("22")) return new DomainRuleError("invalid_input", "Some of that information isn’t valid.");
  if (code === "PGRST200" || code === "PGRST204" || code === "PGRST100") return new InvalidRequestError("The request could not be understood.");
  return new Error("The database request failed.", { cause: error });
}

/** Unauthenticated / forbidden outcomes of a lookup that should read as "no session" rather than an error. */
export const isNoSession = (e: unknown): boolean => e instanceof UnauthenticatedError || e instanceof ForbiddenError;
