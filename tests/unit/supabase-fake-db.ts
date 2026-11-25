/**
 * A chainable stand-in for the slice of the Supabase client the adapter uses (src/data/repositories/supabase/db.ts).
 * It records every call and answers through a handler. It proves the adapter builds the right queries and maps results; it does
 * NOT prove anything about Postgres, PostgREST, RLS or GoTrue (that is what tests/remote is for).
 */
import type { Db, PgError, QueryBuilder, QueryResult } from "@/data/repositories/supabase/db";

export type Call = {
  op: "select" | "insert" | "update" | "delete" | "rpc";
  table: string; // table name, or the function name for rpc
  columns?: string;
  values?: unknown;
  filters: [method: string, column: string, value: unknown][];
  orders: { column: string; options?: unknown }[];
  single?: "maybe" | "one";
  /** `select()` chained after insert/update/delete (RETURNING). */
  returning?: string;
};
export type Answer = { data?: unknown; error?: PgError } | undefined;
export type Handler = (call: Call) => Answer;

class Query implements QueryBuilder {
  call: Call;
  constructor(private readonly run: (c: Call) => QueryResult, table: string, op: Call["op"]) { this.call = { op, table, filters: [], orders: [] }; }
  select(columns?: string) { if (this.call.op === "select") this.call.columns = columns; else this.call.returning = columns ?? "*"; return this; }
  insert(values: unknown) { this.call.op = "insert"; this.call.values = values; return this; }
  update(values: unknown) { this.call.op = "update"; this.call.values = values; return this; }
  delete() { this.call.op = "delete"; return this; }
  eq(column: string, value: unknown) { this.call.filters.push(["eq", column, value]); return this; }
  in(column: string, values: readonly unknown[]) { this.call.filters.push(["in", column, values]); return this; }
  order(column: string, options?: { ascending?: boolean; referencedTable?: string }) { this.call.orders.push({ column, options }); return this; }
  limit() { return this; }
  maybeSingle() { this.call.single = "maybe"; return this; }
  single() { this.call.single = "one"; return this; }
  then<A = QueryResult, B = never>(ok?: ((v: QueryResult) => A | PromiseLike<A>) | null, bad?: ((r: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run(this.call)).then(ok, bad);
  }
}

export function createFakeDb(handler: Handler) {
  const calls: Call[] = [];
  const run = (c: Call): QueryResult => {
    calls.push(structuredClone(c));
    const a = handler(c);
    const error = a?.error ?? null;
    let data = a?.data;
    if (data === undefined) data = c.single ? null : [];
    // `.single()/.maybeSingle()` receive one row (or null), lists receive arrays: mimic PostgREST for convenience.
    if (c.single && Array.isArray(data)) data = data[0] ?? null;
    return { data, error };
  };
  const db: Db = {
    from: (table) => new Query(run, table, "select"),
    rpc: (fn, args) => { const q = new Query(run, fn, "rpc"); q.call.values = args; return q; },
  };
  return { db, calls };
}

export const byTable = (answers: Record<string, unknown | ((c: Call) => Answer)>): Handler => (c) => {
  const a = answers[`${c.op}:${c.table}`] ?? answers[c.table];
  return typeof a === "function" ? (a as (c: Call) => Answer)(c) : a === undefined ? undefined : { data: a };
};
