/** The remote tests' own plumbing, tested against a LOCAL fake server. This is the only remote-folder file that runs without a project. */
import { createServer, type Server } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Api, forgeToken, message, refused, remoteStatus, tamperToken } from "./client";

let server: Server | null = null;
afterEach(() => { server?.close(); server = null; });
const start = async (handler: (req: { method: string; url: string; headers: Record<string, string | string[] | undefined>; body: string }) => [number, unknown]) => {
  server = createServer(async (req, res) => {
    let body = ""; for await (const c of req) body += c;
    const [code, json] = handler({ method: req.method!, url: req.url!, headers: req.headers, body });
    res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(json));
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server!.address() as { port: number }).port}`;
};
const jwt = (t: string) => JSON.parse(Buffer.from(t.split(".")[1]!, "base64url").toString());

describe("Api", () => {
  it("signs in through the GoTrue password grant with the anon key and returns the access token", async () => {
    const seen: { url?: string; apikey?: unknown; body?: unknown } = {};
    const url = await start((r) => { Object.assign(seen, { url: r.url, apikey: r.headers.apikey, body: JSON.parse(r.body) }); return [200, { access_token: "tok.en.sig" }]; });
    expect(await new Api({ url, anonKey: "anon" }).signIn("a@b.example", "pw")).toBe("tok.en.sig");
    expect(seen).toEqual({ url: "/auth/v1/token?grant_type=password", apikey: "anon", body: { email: "a@b.example", password: "pw" } });
  });
  it("a failed sign-in explains itself without echoing the password", async () => {
    const url = await start(() => [400, { msg: "Invalid login credentials" }]);
    const err = await new Api({ url, anonKey: "anon" }).signIn("a@b.example", "super-secret").catch((e: Error) => e);
    expect((err as Error).message).toMatch(/Sign-in failed for a@b\.example \(HTTP 400\)/);
    expect((err as Error).message).not.toContain("super-secret");
  });
  it("an anonymous call carries only the anon key; a user call carries the user's token plus the anon apikey", async () => {
    const heads: Record<string, unknown>[] = [];
    const url = await start((r) => { heads.push({ ...r.headers }); return [200, []]; });
    const api = new Api({ url, anonKey: "ANON" });
    await api.get(null, "people");
    await api.get("USER.TOKEN.SIG", "people", { "accept-profile": "private" });
    expect(heads[0]).toMatchObject({ apikey: "ANON", authorization: "Bearer ANON" });
    expect(heads[1]).toMatchObject({ apikey: "ANON", authorization: "Bearer USER.TOKEN.SIG", "accept-profile": "private" });
  });
  it("write asks for the affected rows back, rpc posts JSON arguments, and responses parse as JSON or text", async () => {
    const calls: { method: string; url: string; prefer: unknown; body: string }[] = [];
    const url = await start((r) => { calls.push({ method: r.method, url: r.url, prefer: r.headers.prefer, body: r.body }); return [200, [{ id: 1 }]]; });
    const api = new Api({ url, anonKey: "A" });
    expect((await api.write("t", "PATCH", "people?id=eq.1", { a: 1 })).json).toEqual([{ id: 1 }]);
    await api.rpc("t", "submit_proposal", { p_id: "x" });
    expect(calls[0]).toMatchObject({ method: "PATCH", url: "/rest/v1/people?id=eq.1", prefer: "return=representation" });
    expect(calls[1]).toMatchObject({ method: "POST", url: "/rest/v1/rpc/submit_proposal", body: JSON.stringify({ p_id: "x" }) });
  });
  it("classifies refusals and extracts PostgREST messages", () => {
    expect(refused({ status: 401, json: null, headers: new Headers() })).toBe(true);
    expect(refused({ status: 406, json: null, headers: new Headers() })).toBe(true);
    expect(refused({ status: 200, json: [], headers: new Headers() })).toBe(false);
    expect(message({ status: 403, json: { message: "permission denied for table x", code: "42501" }, headers: new Headers() })).toMatch(/permission denied.*42501/);
  });
});

describe("forged tokens", () => {
  it("forgeToken builds a three-part HS256 JWT carrying the claims, signed with a throwaway secret", () => {
    const t = forgeToken({ sub: "11111111-1111-4111-8111-111111111111", app_metadata: { role: "admin" } });
    expect(t.split(".")).toHaveLength(3);
    expect(jwt(t)).toMatchObject({ sub: "11111111-1111-4111-8111-111111111111", role: "authenticated", app_metadata: { role: "admin" } });
    expect(forgeToken({}, "s1")).not.toBe(forgeToken({}, "s2"));
  });
  it("tamperToken changes the payload and keeps the original signature", () => {
    const original = forgeToken({ sub: "a" }, "secret");
    const edited = tamperToken(original, { sub: "b", role: "service_role" });
    expect(jwt(edited)).toMatchObject({ sub: "b", role: "service_role" });
    expect(edited.split(".")[2]).toBe(original.split(".")[2]);
    expect(edited.split(".")[1]).not.toBe(original.split(".")[1]);
  });
});

describe("remoteStatus", () => {
  const creds = (ref: string) => { const f = join(mkdtempSync(join(tmpdir(), "rs-")), "c.json"); writeFileSync(f, JSON.stringify({ project_ref: ref, accounts: { laura: { email: "l@x.example", password: "p" } } })); return f; };
  const REMOTE = { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };
  it("skips, with a reason, when no project or no credentials are configured", () => {
    expect(remoteStatus({}, "nope.json")).toMatchObject({ state: "skip", reason: expect.stringMatching(/not set/) });
    expect(remoteStatus(REMOTE, "does-not-exist.json")).toMatchObject({ state: "skip", reason: expect.stringMatching(/provision/) });
  });
  it("REFUSES to run against a remote project that was not confirmed as the fictional one, or a mismatching confirmation", () => {
    expect(remoteStatus(REMOTE, creds("abcdefghijklmnop"))).toMatchObject({ state: "refuse", reason: expect.stringMatching(/not been confirmed/) });
    expect(remoteStatus({ ...REMOTE, SPARQ_CONFIRM_FICTIONAL_PROJECT: "other" }, creds("abcdefghijklmnop"))).toMatchObject({ state: "refuse", reason: expect.stringMatching(/does not match/) });
  });
  it("refuses credentials saved for another project, and is ready only when everything matches", () => {
    const env = { ...REMOTE, SPARQ_CONFIRM_FICTIONAL_PROJECT: "abcdefghijklmnop" };
    expect(remoteStatus(env, creds("zzzzzzzzzzzzzzzz"))).toMatchObject({ state: "refuse", reason: expect.stringMatching(/belongs to project/) });
    const ok = remoteStatus(env, creds("abcdefghijklmnop"));
    expect(ok.state).toBe("ready");
    if (ok.state === "ready") expect(ok.creds.laura!.email).toBe("l@x.example");
  });
});
