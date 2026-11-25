/**
 * Demo account provisioning: id/uuid parity with the app's seed ids, the Admin API conversation (against a LOCAL fake server, never a
 * real project), idempotency, password handling, the guard, and the rule that admin credentials never reach the application code.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SEED_USERS, U, SEED_NAMESPACE, uuidV5 } from "@/data/seed/ids";
import * as mjs from "../../scripts/db/seed-users.mjs";
import { ProvisionError, planAccounts, provision } from "../../scripts/db/provision.mjs";
import { GuardError } from "../../scripts/db/guard.mjs";
import { ROOT } from "./harness";

describe("scripts/db/seed-users.mjs duplicates the app's ids on purpose; they must never drift", () => {
  it("derives identical UUID v5 values", () => {
    expect(mjs.SEED_NAMESPACE).toBe(SEED_NAMESPACE);
    for (const name of ["user:laura", "person:ana", "opportunity:vela", "x"]) expect(mjs.uuidV5(name)).toBe(uuidV5(name));
  });
  it("lists the same accounts, names, titles and (single) roles, with the same ids", () => {
    expect(mjs.DEMO_USERS.map((u) => ({ ...u }))).toEqual(SEED_USERS.map((u) => ({ key: u.key, name: u.name, title: u.title, roles: [...u.roles] })));
    for (const u of SEED_USERS) { expect(mjs.userId(u.key)).toBe(U[u.key]); expect(u.roles).toHaveLength(1); }
  });
  it("plans fictional .example addresses on the reserved TLD", () => {
    expect(planAccounts().map((a) => a.email)).toEqual(SEED_USERS.map((u) => `${u.key}@sparq-demo.example`));
  });
});

/* ---- a fake GoTrue admin API --------------------------------------------------------------------------------------------------- */
type Rec = { method: string; path: string; body: any; auth: string | undefined }; // eslint-disable-line @typescript-eslint/no-explicit-any
let server: Server | null = null;
afterEach(() => { server?.close(); server = null; });

async function fake(existing: Record<string, { email: string }> = {}) {
  const users = new Map(Object.entries(existing));
  const calls: Rec[] = [];
  server = createServer(async (req: IncomingMessage, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    calls.push({ method: req.method!, path: req.url!, body, auth: req.headers.authorization });
    const id = req.url!.split("/").pop()!;
    const send = (code: number, json: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(json)); };
    if (req.method === "GET") return users.has(id) ? send(200, { id, ...users.get(id) }) : send(404, { code: 404, error_code: "user_not_found", msg: "User not found" });
    if (req.method === "POST") { users.set(body.id, { email: body.email }); return send(200, { id: body.id }); }
    if (req.method === "PUT") return users.has(id) ? send(200, { id }) : send(404, {});
    send(405, {});
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const port = (server!.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, calls };
}
const dir = () => mkdtempSync(join(tmpdir(), "prov-"));

describe("provision", () => {
  it("--dry-run touches no network, needs no service key and writes nothing", async () => {
    const lines: string[] = [];
    const credentialsPath = join(dir(), "c.json");
    const r = await provision({ env: { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1" }, dryRun: true, credentialsPath, log: (m) => lines.push(m), fetchImpl: () => { throw new Error("network!"); } });
    expect(r).toMatchObject({ dryRun: true, created: [] });
    expect(lines.filter((l) => /would provision/.test(l))).toHaveLength(7);
    expect(existsSync(credentialsPath)).toBe(false);
  });
  it("creates the 7 accounts with their fixed ids, confirmed emails and generated passwords, saved 0600 and never logged", async () => {
    const { url, calls } = await fake();
    const credentialsPath = join(dir(), "c.json");
    const lines: string[] = [];
    let n = 0;
    const r = await provision({ env: { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: "svc-key" }, credentialsPath, log: (m) => lines.push(m), randomPassword: () => `pw-${++n}-xxxxxxxxxxxxxxxx` });
    expect(r.created).toEqual(SEED_USERS.map((u) => u.key));
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(7);
    for (const u of SEED_USERS) {
      const p = posts.find((c) => c.body.id === U[u.key])!;
      expect(p.body).toMatchObject({ email: `${u.key}@sparq-demo.example`, email_confirm: true, user_metadata: { display_name: u.name, demo: true, fictional: true } });
      expect(p.body.password).toMatch(/^pw-\d-/);
      expect(p.auth).toBe("Bearer svc-key");
    }
    const saved = JSON.parse(readFileSync(credentialsPath, "utf8"));
    expect(saved.project_ref).toBe("local");
    expect(Object.keys(saved.accounts)).toEqual(SEED_USERS.map((u) => u.key));
    expect(statSync(credentialsPath).mode & 0o777).toBe(0o600);
    const log = lines.join("\n");
    expect(log).not.toMatch(/pw-\d|svc-key/);
  });
  it("is idempotent: existing accounts only get their metadata updated, passwords and the credentials file are untouched", async () => {
    const existing = Object.fromEntries(SEED_USERS.map((u) => [U[u.key], { email: `${u.key}@sparq-demo.example` }]));
    const { url, calls } = await fake(existing);
    const credentialsPath = join(dir(), "c.json");
    const r = await provision({ env: { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: "k" }, credentialsPath });
    expect(r).toMatchObject({ created: [], rotated: [] });
    expect(r.existing).toHaveLength(7);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    for (const c of calls.filter((x) => x.method === "PUT")) expect(Object.keys(c.body)).toEqual(["user_metadata"]);
    expect(existsSync(credentialsPath)).toBe(false);
  });
  it("--rotate issues new passwords for existing accounts and saves them", async () => {
    const existing = Object.fromEntries(SEED_USERS.map((u) => [U[u.key], { email: `${u.key}@sparq-demo.example` }]));
    const { url, calls } = await fake(existing);
    const credentialsPath = join(dir(), "c.json");
    const r = await provision({ env: { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: "k" }, credentialsPath, rotate: true });
    expect(r.rotated).toHaveLength(7);
    for (const c of calls.filter((x) => x.method === "PUT")) expect(typeof c.body.password).toBe("string");
    expect(Object.keys(JSON.parse(readFileSync(credentialsPath, "utf8")).accounts)).toHaveLength(7);
  });
  it("refuses an account whose id exists with a different email, and a credentials file from another project", async () => {
    const { url } = await fake({ [U.laura]: { email: "someone-else@example.com" } });
    await expect(provision({ env: { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: "k" }, credentialsPath: join(dir(), "c.json") })).rejects.toThrow(/different email/);
    const { url: url2 } = await fake();
    const d = dir();
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(d, "c.json"), JSON.stringify({ project_ref: "otherprojectref", accounts: {} }));
    await expect(provision({ env: { NEXT_PUBLIC_SUPABASE_URL: url2, SUPABASE_SERVICE_ROLE_KEY: "k" }, credentialsPath: join(d, "c.json") })).rejects.toThrow(/belongs to project/);
  });
  it("requires the service key (outside a dry run) and a confirmed fictional project for any remote URL", async () => {
    await expect(provision({ env: { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1" }, credentialsPath: join(dir(), "c.json") })).rejects.toThrow(ProvisionError);
    const remote = { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" };
    await expect(provision({ env: remote, fetchImpl: () => { throw new Error("network!"); } })).rejects.toThrow(GuardError);
    await expect(provision({ env: { ...remote, SPARQ_CONFIRM_FICTIONAL_PROJECT: "wrong" }, fetchImpl: () => { throw new Error("network!"); } })).rejects.toThrow(/does not match/);
  });
  it("reports an API failure without echoing credentials", async () => {
    server = createServer((_req, res) => { res.writeHead(401, { "content-type": "application/json" }); res.end(JSON.stringify({ msg: "invalid api key" })); });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${(server!.address() as { port: number }).port}`;
    const err = await provision({ env: { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: "very-secret-key" }, credentialsPath: join(dir(), "c.json") }).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/HTTP 401/);
    expect((err as Error).message).not.toContain("very-secret-key");
  });
});

describe("administrative credentials never reach the application", () => {
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  const SECRETS = /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|SPARQ_CONFIRM_FICTIONAL_PROJECT/;
  it("nothing under src/ (nor the Next config) mentions the service-role key, the database URL or the confirmation variable", () => {
    const files = [...walk(join(ROOT, "src")), ...["next.config.ts", "next.config.mjs", "next.config.js"].map((f) => join(ROOT, f)).filter(existsSync)];
    expect(files.length).toBeGreaterThan(20);
    expect(files.filter((f) => SECRETS.test(readFileSync(f, "utf8"))).map((f) => f.replace(ROOT, ""))).toEqual([]);
  });
  it("admin scripts never import application code, and the app never imports the scripts", () => {
    for (const f of walk(join(ROOT, "scripts", "db")).filter((x) => /\.(mjs|mts)$/.test(x))) expect(readFileSync(f, "utf8"), f).not.toMatch(/from ["'][^"']*\/src\//);
    for (const f of walk(join(ROOT, "src")).filter((x) => /\.(ts|tsx)$/.test(x))) expect(readFileSync(f, "utf8"), f).not.toMatch(/(from|import)\s*\(?\s*["'][^"']*scripts\/db/);
  });
  it(".env.example keeps the admin-only variables apart from the app's, and the secret files are gitignored", () => {
    const example = readFileSync(join(ROOT, ".env.example"), "utf8");
    const adminAt = example.indexOf("ADMIN-ONLY");
    expect(adminAt).toBeGreaterThan(0);
    for (const k of ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL", "SPARQ_CONFIRM_FICTIONAL_PROJECT"]) expect(example.indexOf(k), k).toBeGreaterThan(adminAt);
    for (const k of ["SPARQ_DATA_SOURCE", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "ANTHROPIC_API_KEY", "SPARQ_ASSISTANT_MODEL", "SPARQ_ASSISTANT_DAILY_LIMIT"]) {
      const at = example.indexOf(k);
      expect(at, k).toBeGreaterThanOrEqual(0);
      expect(at, k).toBeLessThan(adminAt);
    }
    const ignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
    for (const k of [".env.admin.local", ".demo-credentials.local.json"]) expect(ignore, k).toContain(k);
  });
});
