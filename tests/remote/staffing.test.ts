/**
 * REMOTE verification of the staffing workflow's authorization and of the capacity rule under concurrency, with real tokens and
 * independent HTTP requests: proposing is not assigning, only the delivery lead assigned to the opportunity decides, only after approval
 * can a seat be confirmed, and parallel confirmations can never over-allocate a person.
 *
 * STATUS: written to run against a real project; NOT yet executed against one. Not a production-readiness claim.
 *
 * It creates throwaway proposals through the API (author: Laura; reviewer: Rafael, who leads Terra) for Lucía, in random far-future
 * windows so repeated runs do not collide. When SUPABASE_DB_URL is available (admin env) the rows are deleted afterwards through a
 * guarded direct connection; otherwise they remain (fictional data) and are harmless because the windows are years away.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { U, seedId } from "@/data/seed/ids";
import { prepareTarget } from "../../scripts/db/migrate.mjs";
import { announce, message, refused, remoteStatus, rows } from "./client";
import { remoteSession } from "./session";

const status = remoteStatus();
announce("staffing", status);

if (status.state === "refuse") {
  describe("remote staffing", () => { it("refuses to run", () => { throw new Error(status.reason); }); });
} else {
  describe.skipIf(status.state === "skip")("remote staffing: authorization and concurrent capacity", () => {
    const ready = status as Extract<typeof status, { state: "ready" }>;
    const { api, token } = remoteSession(ready);
    const created: string[] = [];
    const TERRA = seedId("opportunity", "terra");
    const LUCIA = seedId("person", "lucia");
    const ok = (r: { status: number }) => r.status < 300;

    /** A random 11-day window in a far-future year (distinct per call), as [start, end, availableFrom]. */
    const windows = new Set<string>();
    function window(yearFrom: number): [string, string, string] {
      for (;;) {
        const start = new Date(Date.UTC(yearFrom + Math.floor(Math.random() * 90), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 15)));
        const iso = (d: Date) => d.toISOString().slice(0, 10);
        if (windows.has(iso(start))) continue;
        windows.add(iso(start));
        const end = new Date(start.getTime() + 10 * 86_400_000), free = new Date(start.getTime() + 11 * 86_400_000);
        return [iso(start), iso(end), iso(free)];
      }
    }

    async function draft(allocation: number) {
      const laura = await token("laura");
      const p = await api.write(laura, "POST", "team_proposals", { opportunity_id: TERRA, title: `Remote test ${new Date().toISOString()}`, brief: "throwaway proposal created by tests/remote" });
      expect(p.status, message(p)).toBe(201);
      const id = rows(p)[0]!.id as string;
      created.push(id);
      const s = await api.write(laura, "POST", "proposal_seats", { proposal_id: id, title: "Remote test seat", capabilities: ["AWS"], allocation, person_id: LUCIA, seat_state: "proposed", position: 0 });
      expect(s.status, message(s)).toBe(201);
      return { id, seat: rows(s)[0]!.id as string };
    }
    const submit = async (id: string) => expect(ok(await api.rpc(await token("laura"), "submit_proposal", { p_id: id, p_note: null }))).toBe(true);
    const review = (who: Parameters<typeof token>[0], id: string, decision = "approved") => token(who).then((t) => api.rpc(t, "review_proposal", { p_id: id, p_decision: decision, p_note: decision === "approved" ? null : "needs work" }));
    const confirm = (who: Parameters<typeof token>[0], seat: string, w: [string, string, string], allocation: number | null = null) =>
      token(who).then((t) => api.rpc(t, "confirm_assignment", { p_seat_id: seat, p_starts_on: w[0], p_ends_on: w[1], p_available_from: w[2], p_allocation: allocation }));
    const stateOf = async (id: string) => rows(await api.get(await token("laura"), `team_proposals?id=eq.${id}&select=state`))[0]?.state as string | undefined;
    const assignmentsFor = async (seats: string[]) => rows(await api.get(await token("rafael"), `assignments?proposal_seat_id=in.(${seats.join(",")})&select=id,proposal_seat_id,allocation`));
    async function approved(allocation: number) { const x = await draft(allocation); await submit(x.id); expect(ok(await review("rafael", x.id)), "setup: Rafael approves").toBe(true); return x; }

    beforeAll(async () => {
      expect((await api.get(await token("laura"), `opportunities?slug=eq.terra&select=id`)).json[0].id, "the seeded Terra opportunity").toBe(TERRA);
    });

    afterAll(async () => {
      if (created.length === 0) return;
      if (!ready.dbUrl) { console.warn(`[remote] staffing: ${created.length} throwaway proposal(s) left in the fictional project (no SUPABASE_DB_URL for cleanup).`); return; }
      const { target, connectionString, ssl } = prepareTarget(ready.env);
      if (target.ref !== ready.target.ref) throw new Error("SUPABASE_DB_URL points at a different project than NEXT_PUBLIC_SUPABASE_URL; not cleaning up.");
      const { default: pg } = await import("pg");
      const client = new pg.Client({ connectionString, ssl });
      await client.connect();
      try {
        await client.query("delete from public.assignments where proposal_seat_id in (select id from public.proposal_seats where proposal_id = any($1::uuid[]))", [created]);
        await client.query("delete from public.proposal_reviews where proposal_id = any($1::uuid[])", [created]);
        await client.query("delete from public.team_proposals where id = any($1::uuid[])", [created]);
      } finally { await client.end(); }
    });

    describe("proposing is not assigning", () => {
      it("a draft is private to its author: the delivery lead cannot see it, review it, or confirm its seat", async () => {
        const d = await draft(0.1);
        expect(rows(await api.get(await token("rafael"), `team_proposals?id=eq.${d.id}`))).toEqual([]);
        expect(refused(await review("rafael", d.id))).toBe(true);
        expect(refused(await confirm("rafael", d.seat, window(2100)))).toBe(true);
        expect(await stateOf(d.id)).toBe("draft");
      });

      it("only the delivery lead of THAT opportunity can approve: the author, an engineer, another delivery lead and an administrator are refused", async () => {
        const d = await draft(0.1);
        await submit(d.id);
        for (const who of ["laura", "ana", "lucia", "ines", "admin"] as const) {
          const r = await review(who, d.id);
          expect(refused(r), who).toBe(true);
          expect(message(r), who).toMatch(/only the delivery lead assigned to this opportunity|not found|permission/i);
        }
        expect(await stateOf(d.id)).toBe("submitted");
        // An unreviewed (submitted) proposal cannot become an assignment, even for the right delivery lead.
        expect(message(await confirm("rafael", d.seat, window(2100)))).toMatch(/only seats of an approved proposal/);
        expect(rows(await api.get(await token("rafael"), `assignments?proposal_seat_id=eq.${d.seat}`))).toEqual([]);
      });

      it("approval creates NO assignment; then only that delivery lead can confirm the seat, once", async () => {
        const d = await approved(0.1);
        expect(await stateOf(d.id)).toBe("approved");
        expect(await assignmentsFor([d.seat])).toEqual([]); // approved is not assigned
        const w = window(2100);
        for (const who of ["laura", "ana", "lucia", "ines", "admin"] as const) {
          const r = await confirm(who, d.seat, w);
          expect(refused(r), who).toBe(true);
        }
        expect(await assignmentsFor([d.seat])).toEqual([]);
        const first = await confirm("rafael", d.seat, w);
        expect(first.status, message(first)).toBeLessThan(300);
        expect(await assignmentsFor([d.seat])).toHaveLength(1);
        expect(message(await confirm("rafael", d.seat, window(2100)))).toMatch(/already confirmed/);
        expect(await assignmentsFor([d.seat])).toHaveLength(1);
      });

      it("an approval cannot be undone or repeated by someone else, and a confirmed assignment cannot be edited or deleted through the API", async () => {
        const d = await approved(0.1);
        expect(refused(await review("rafael", d.id, "declined"))).toBe(true); // already approved: no second decision
        expect(await stateOf(d.id)).toBe("approved");
        const w = window(2100);
        expect((await confirm("rafael", d.seat, w)).status).toBeLessThan(300);
        const a = (await assignmentsFor([d.seat]))[0]!;
        for (const who of ["rafael", "laura", "admin"] as const) {
          expect(refused(await api.write(await token(who), "PATCH", `assignments?id=eq.${a.id}`, { allocation: 0.01 })), `${who} edit`).toBe(true);
          expect(refused(await api.write(await token(who), "DELETE", `assignments?id=eq.${a.id}`)), `${who} delete`).toBe(true);
        }
      });
    });

    describe("capacity under concurrency (independent requests)", () => {
      it("three parallel confirmations of 0.5 for one person in the same window: exactly two succeed", async () => {
        const w = window(2200);
        const seats = await Promise.all([approved(0.5), approved(0.5), approved(0.5)]);
        const results = await Promise.all(seats.map((s) => confirm("rafael", s.seat, w, 0.5)));
        const winners = results.filter(ok), losers = results.filter((r) => !ok(r));
        expect(winners, results.map((r) => `${r.status}:${message(r)}`).join(" | ")).toHaveLength(2);
        expect(losers).toHaveLength(1);
        expect(message(losers[0]!)).toMatch(/exceeds the person's capacity/);
        expect(await assignmentsFor(seats.map((s) => s.seat))).toHaveLength(2);
      });
      it("two parallel full-time confirmations in the same window: exactly one succeeds", async () => {
        const w = window(2300);
        const seats = await Promise.all([approved(1), approved(1)]);
        const results = await Promise.all(seats.map((s) => confirm("rafael", s.seat, w, 1)));
        expect(results.filter(ok)).toHaveLength(1);
        expect(message(results.find((r) => !ok(r))!)).toMatch(/exceeds the person's capacity/);
        expect(await assignmentsFor(seats.map((s) => s.seat))).toHaveLength(1);
      });
      it("parallel confirmations in DIFFERENT windows all succeed (the lock serialises, it does not block what fits)", async () => {
        const seats = await Promise.all([approved(1), approved(1), approved(1)]);
        const results = await Promise.all(seats.map((s) => confirm("rafael", s.seat, window(2400), 1)));
        expect(results.filter(ok), results.map((r) => `${r.status}:${message(r)}`).join(" | ")).toHaveLength(3);
      });
    });

    it("the people involved are who the seed says (guards the assumptions above)", () => {
      expect(U.rafael).toBeTruthy();
      expect(LUCIA).toBe(seedId("person", "lucia"));
    });
  });
}
