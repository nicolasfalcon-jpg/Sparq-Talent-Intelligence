// @vitest-environment node
/**
 * Sign-in, session gate and client construction, with the Supabase libraries mocked. Nothing here talks to a real Auth server:
 * real token issuance, expiry/refresh and cookie behaviour are verified only by the remote integration tests (tests/remote).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  jarObj: { getAll: () => [] as { name: string; value: string }[], set: vi.fn() },
  createServerClient: vi.fn(),
  auth: { signInWithPassword: vi.fn(), signOut: vi.fn(), getUser: vi.fn() },
  user: null as unknown,
  redirects: [] as string[],
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => h.jarObj }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { h.redirects.push(to); throw new Error(`NEXT_REDIRECT:${to}`); } }));
vi.mock("@supabase/ssr", () => ({ createServerClient: (...a: unknown[]) => { h.createServerClient(...a); return { auth: h.auth, from: () => ({}), rpc: () => ({}) }; } }));
vi.mock("@/data/repositories/supabase/directory", () => ({ loadCurrentUser: async () => h.user }));

import { signIn } from "@/features/auth/actions";
import { safeNextPath } from "@/features/auth/redirect";
import { NO_ROLE_ERROR, SIGN_IN_ERROR, SIGN_IN_MISSING } from "@/features/auth/schema";
import { NextRequest } from "next/server";
import { decideAccess, updateSupabaseSession } from "@/lib/supabase/middleware";
import { createRequestClient } from "@/lib/supabase/server";

const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

beforeEach(() => {
  vi.clearAllMocks(); h.redirects.length = 0; h.user = null;
  h.jarObj = { getAll: () => [], set: vi.fn() }; // a NEW cookie store = a new request
  vi.stubEnv("SPARQ_DATA_SOURCE", "supabase");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example-project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
});

describe("safe redirect targets (no open redirects)", () => {
  it.each(["/", "/people", "/opportunities?open=vela", "/opportunities/new/team?o=vela"])("accepts %s", (p) => {
    expect(safeNextPath(p)).toBe(p);
  });
  it.each([
    "https://evil.example/", "//evil.example", "/\\evil.example", "\\\\evil.example", "http:/evil.example", "javascript:alert(1)", "evil", "", " /people",
    "/people\r\nSet-Cookie: a=b", "/pe\u0000ople", "/login", "/login?next=/x", "/logout", "/api/assistant", "/" + "a".repeat(600),
  ])("rejects %j", (p) => { expect(safeNextPath(p)).toBeNull(); });
  it("rejects non-strings", () => { for (const v of [undefined, null, 5, {}, ["/x"]]) expect(safeNextPath(v)).toBeNull(); });
  it("drops a fragment (it never reaches the server anyway)", () => { expect(safeNextPath("/people/ana#evidence")).toBe("/people/ana"); });
  it("keeps the query string of a same-origin path but never an origin", () => {
    expect(safeNextPath("/people?q=%2F%2Fevil.example")).toBe("/people?q=%2F%2Fevil.example");
  });
});

describe("session gate (decideAccess)", () => {
  const d = (over: Partial<Parameters<typeof decideAccess>[0]>) => decideAccess({ method: "GET", pathname: "/", search: "", authenticated: false, ...over });
  it("sends anonymous page navigations to /login, remembering a safe next", () => {
    expect(d({ pathname: "/" })).toEqual({ kind: "redirect", to: "/login" });
    expect(d({ pathname: "/people", search: "?q=swift" })).toEqual({ kind: "redirect", to: `/login?next=${encodeURIComponent("/people?q=swift")}` });
  });
  it("never redirects API routes or non-GET requests (server actions answer for themselves)", () => {
    expect(d({ pathname: "/api/assistant" })).toEqual({ kind: "next" });
    expect(d({ method: "POST", pathname: "/people" })).toEqual({ kind: "next" });
    expect(d({ method: "POST", pathname: "/opportunities/new/team" })).toEqual({ kind: "next" });
  });
  it("lets everyone reach /login and /logout; a signed-in visitor on /login goes Home", () => {
    expect(d({ pathname: "/login" })).toEqual({ kind: "next" });
    expect(d({ pathname: "/logout" })).toEqual({ kind: "next" });
    expect(d({ pathname: "/login", authenticated: true })).toEqual({ kind: "redirect", to: "/" });
  });
  it("lets an authenticated visitor through", () => {
    expect(d({ pathname: "/people", authenticated: true })).toEqual({ kind: "next" });
  });
  it("does not trust path tricks as public", () => {
    expect(d({ pathname: "/login-admin" })).toMatchObject({ kind: "redirect" });
    expect(d({ pathname: "/loginx/y" })).toMatchObject({ kind: "redirect" });
  });
});

describe("updateSupabaseSession", () => {
  const req = (path: string, method = "GET") => new NextRequest(new URL(path, "https://app.example.test"), { method });
  it("validates with the Auth server (getUser), then redirects anonymous pages and passes API calls through", async () => {
    h.auth.getUser.mockResolvedValue({ data: { user: null } });
    const page = await updateSupabaseSession(req("/people?q=ios"));
    expect(h.auth.getUser).toHaveBeenCalledTimes(1);
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe(`https://app.example.test/login?next=${encodeURIComponent("/people?q=ios")}`);
    const api = await updateSupabaseSession(req("/api/assistant", "POST"));
    expect(api.headers.get("location")).toBeNull();
    expect(api.status).toBe(200);
  });
  it("lets a signed-in visitor through and uses only the public key", async () => {
    h.auth.getUser.mockResolvedValue({ data: { user: { id: "u" } } });
    const res = await updateSupabaseSession(req("/people"));
    expect(res.headers.get("location")).toBeNull();
    expect(h.createServerClient.mock.calls[0]![1]).toBe("anon-key");
  });
});

describe("signIn action", () => {
  it("validates input and gives one generic message for wrong credentials (no user enumeration)", async () => {
    expect(await signIn({ error: null }, form({ email: "", password: "" }))).toEqual({ error: SIGN_IN_MISSING });
    h.auth.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const unknownEmail = await signIn({ error: null }, form({ email: "nobody@example.test", password: "x" }));
    h.auth.signInWithPassword.mockResolvedValue({ error: { message: "Email not confirmed" } });
    const wrongPassword = await signIn({ error: null }, form({ email: "laura@example.test", password: "bad" }));
    expect(unknownEmail).toEqual({ error: SIGN_IN_ERROR });
    expect(wrongPassword).toEqual(unknownEmail);
    expect(SIGN_IN_ERROR).toBe("Email or password is incorrect.");
    expect(h.redirects).toEqual([]);
  });
  it("redirects to the role's home using the role loaded from the database", async () => {
    h.auth.signInWithPassword.mockResolvedValue({ error: null });
    for (const [role, home] of [["staffing_lead", "/"], ["engineer", "/me"], ["delivery_lead", "/opportunities"], ["admin", "/admin"]] as const) {
      h.redirects.length = 0; h.user = { id: "u", role };
      await expect(signIn({ error: null }, form({ email: "a@example.test", password: "p" }))).rejects.toThrow(`NEXT_REDIRECT:${home}`);
    }
  });
  it("honours a safe next and ignores an unsafe one", async () => {
    h.auth.signInWithPassword.mockResolvedValue({ error: null }); h.user = { id: "u", role: "engineer" };
    await expect(signIn({ error: null }, form({ email: "a@example.test", password: "p", next: "/me/passport" }))).rejects.toThrow("NEXT_REDIRECT:/me/passport");
    for (const evil of ["https://evil.example", "//evil.example", "/\\evil", "/login"]) {
      h.redirects.length = 0;
      await expect(signIn({ error: null }, form({ email: "a@example.test", password: "p", next: evil }))).rejects.toThrow("NEXT_REDIRECT:/me");
    }
  });
  it("an authenticated account without any role is signed out again", async () => {
    h.auth.signInWithPassword.mockResolvedValue({ error: null }); h.user = null;
    expect(await signIn({ error: null }, form({ email: "a@example.test", password: "p" }))).toEqual({ error: NO_ROLE_ERROR });
    expect(h.auth.signOut).toHaveBeenCalled();
  });
  it("refuses to run outside Supabase mode", async () => {
    vi.stubEnv("SPARQ_DATA_SOURCE", "memory");
    expect((await signIn({ error: null }, form({ email: "a@example.test", password: "p" }))).error).toMatch(/not available/);
    expect(h.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("request client", () => {
  it("is built from the public URL and the anon key only, with the request's cookies", async () => {
    await createRequestClient();
    expect(h.createServerClient).toHaveBeenCalledTimes(1);
    const [url, key, opts] = h.createServerClient.mock.calls[0]!;
    expect(url).toBe("https://example-project.supabase.co");
    expect(key).toBe("anon-key");
    expect(typeof (opts as { cookies: { getAll: unknown } }).cookies.getAll).toBe("function");
  });
  it("is reused within one request (same cookie store) and never across requests", async () => {
    const a = await createRequestClient(); const b = await createRequestClient();
    expect(a).toBe(b);
    expect(h.createServerClient).toHaveBeenCalledTimes(1);
    h.jarObj = { getAll: () => [], set: vi.fn() }; // the next request
    const c = await createRequestClient();
    expect(c).not.toBe(a);
    expect(h.createServerClient).toHaveBeenCalledTimes(2);
  });
  it("fails loudly when Supabase is not configured instead of falling back to anything", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    await expect(createRequestClient()).rejects.toThrow(/not configured/);
  });
});

describe("the application never holds privileged credentials", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|mjs|js)$/.test(p) ? [p] : []; });
  const files = walk(join(process.cwd(), "src"));
  it("src/ contains no service-role key, no database URL and no standalone Supabase client", () => {
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.filter((f) => /SERVICE_ROLE|SUPABASE_DB_URL|service_role/i.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));
    expect(offenders.map((f) => f.replace(process.cwd(), ""))).toEqual([]);
    const clients = files.filter((f) => /\bcreateClient\s*\(/.test(readFileSync(f, "utf8")) && /@supabase\/supabase-js/.test(readFileSync(f, "utf8")));
    expect(clients).toEqual([]);
  });
});
