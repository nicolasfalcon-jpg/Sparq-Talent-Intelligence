/**
 * Migration 0011: the per-user daily Ask Sparq limit. The counter table is closed to every API role; the only way to touch it is
 * consume_assistant_quota(), which acts for auth.uid() alone and increments with one atomic upsert.
 */
import { describe, expect, it } from "vitest";
import { U } from "@/data/seed/ids";
import { denied, seen, tryAs, withDb } from "./setup";

const t = withDb();
const consume = (who: string, limit: number | null) => tryAs(t.db, who, "select public.consume_assistant_quota($1::int) as ok", [limit]);
const calls = async (who: string) => Number((await t.db.sql("select coalesce(sum(calls), 0)::int n from assistant_usage where user_id = $1 and day = (now() at time zone 'utc')::date", [who]))[0]!.n);

describe("consume_assistant_quota", () => {
  it("allows calls up to the limit, then refuses WITHOUT counting the refused call", async () => {
    for (let i = 1; i <= 3; i++) {
      const r = await consume(U.ana, 3);
      expect(r.ok && (r.value as { ok: boolean }[])[0]!.ok, `call ${i}`).toBe(true);
    }
    for (let i = 0; i < 2; i++) {
      const r = await consume(U.ana, 3);
      expect(r.ok && (r.value as { ok: boolean }[])[0]!.ok).toBe(false);
    }
    expect(await calls(U.ana)).toBe(3);
  });
  it("counts per user: one person exhausting the limit does not affect another", async () => {
    for (let i = 0; i < 2; i++) await consume(U.ana, 2);
    expect(await calls(U.ana)).toBe(2);
    const r = await consume(U.lucia, 2);
    expect(r.ok && (r.value as { ok: boolean }[])[0]!.ok).toBe(true);
    expect(await calls(U.lucia)).toBe(1);
  });
  it("a new day starts a new count, and yesterday's usage never blocks today", async () => {
    await t.db.sql("insert into assistant_usage (user_id, day, calls) values ($1, (now() at time zone 'utc')::date - 1, 40)", [U.ana]);
    const r = await consume(U.ana, 40);
    expect(r.ok && (r.value as { ok: boolean }[])[0]!.ok).toBe(true);
    expect(await calls(U.ana)).toBe(1);
  });
  it("rejects a missing or out-of-range limit and counts nothing", async () => {
    for (const limit of [null, 0, -1, 1001]) expect(denied(await consume(U.ana, limit)), String(limit)).toMatch(/between 1 and 1000/);
    expect(await calls(U.ana)).toBe(0);
  });
  it("needs a signed-in app user: anon cannot call it, and an unknown identity is refused", async () => {
    expect(denied(await tryAs(t.db, "anon", "select public.consume_assistant_quota(10)"))).toMatch(/permission denied/);
    expect((await consume("00000000-0000-4000-8000-00000000dead", 10)).ok).toBe(false);
    expect((await t.db.sql("select count(*)::int n from assistant_usage"))[0]!.n).toBe(0);
  });
  it("the actor is always the caller: the function takes no user argument, and the increment is one atomic upsert", async () => {
    const def = (await t.db.sql("select pg_get_functiondef('public.consume_assistant_quota(int)'::regprocedure) d"))[0]!.d as string;
    expect(def).toMatch(/auth\.uid|require_actor/);
    expect(def).toMatch(/on conflict \(user_id, day\) do update/i);
    expect(def).not.toMatch(/\bselect\b[^;]*\bfrom public\.assistant_usage\b/i); // no read-then-write race
    expect((await t.db.sql("select pg_get_function_arguments('public.consume_assistant_quota(int)'::regprocedure) a"))[0]!.a).toBe("p_limit integer");
  });
});

describe("the counter table is closed to every API role", () => {
  it("nobody can read, write, reset or delete usage through the API", async () => {
    await consume(U.ana, 5);
    for (const who of ["anon", U.ana, U.laura, U.admin]) {
      expect(denied(await tryAs(t.db, who, "select * from assistant_usage")), who).toMatch(/permission denied/);
      expect(denied(await tryAs(t.db, who, "update assistant_usage set calls = 0")), who).toMatch(/permission denied/);
      expect(denied(await tryAs(t.db, who, "delete from assistant_usage")), who).toMatch(/permission denied/);
      expect(denied(await tryAs(t.db, who, "insert into assistant_usage (user_id, day, calls) values (gen_random_uuid(), current_date, 0)")), who).toMatch(/permission denied/);
    }
    expect(await calls(U.ana)).toBe(1);
    expect((await seen(t.db, U.ana, "select count(*)::int n from my_identity()".replace("from my_identity()", "from (select 1) x"))).length).toBe(1);
  });
});
