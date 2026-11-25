/**
 * HTTP helpers for the remote tests: sign in through GoTrue with the real demo passwords, call PostgREST like the browser/app would
 * (anon key + the user's access token), and build forged tokens to prove the signature is what matters. Plain `fetch`, no dependency.
 * Admin credentials are NOT used here for requests; only an optional direct database URL is used for cleanup (see staffing.test.ts).
 */
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { loadAdminEnv } from "../../scripts/db/env.mjs";
import { GuardError, assertConfirmedProject, projectRefFromHttpUrl, type Target } from "../../scripts/db/guard.mjs";

export type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Res = { status: number; json: Json; headers: Headers };
export type ApiConfig = { url: string; anonKey: string };

const b64 = (x: string | Buffer) => Buffer.from(x).toString("base64url");

export class Api {
  constructor(readonly cfg: ApiConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  /** Password grant through GoTrue. Returns the user's access token (a real, signed JWT). */
  async signIn(email: string, password: string): Promise<string> {
    const res = await this.fetchImpl(`${this.cfg.url}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: this.cfg.anonKey, "content-type": "application/json" }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(30_000),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) throw new Error(`Sign-in failed for ${email} (HTTP ${res.status}). Are the demo accounts provisioned and .demo-credentials.local.json current?`);
    return json.access_token as string;
  }

  /** `token = null` is an anonymous caller: only the anon key. */
  async request(token: string | null, method: string, path: string, opts: { body?: unknown; headers?: Record<string, string> } = {}): Promise<Res> {
    const res = await this.fetchImpl(`${this.cfg.url}${path}`, {
      method,
      headers: { apikey: this.cfg.anonKey, authorization: `Bearer ${token ?? this.cfg.anonKey}`, ...(opts.body !== undefined ? { "content-type": "application/json" } : {}), ...opts.headers },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let json: Json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, json, headers: res.headers };
  }

  rest = (token: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => this.request(token, method, `/rest/v1/${path}`, { body, headers });
  get = (token: string | null, path: string, headers: Record<string, string> = {}) => this.rest(token, "GET", path, undefined, headers);
  /** Insert/patch and get the affected rows back. */
  write = (token: string | null, method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown) => this.rest(token, method, path, body, { prefer: "return=representation" });
  rpc = (token: string | null, fn: string, args: Record<string, unknown> = {}, headers: Record<string, string> = {}) => this.request(token, "POST", `/rest/v1/rpc/${fn}`, { body: args, headers });
}

/** A status that means "the request was refused" (permission denied, unauthenticated, invalid schema, not exposed). */
export const refused = (r: Res): boolean => r.status === 401 || r.status === 403 || r.status === 404 || r.status === 406 || (r.status >= 400 && r.status < 500);
export const rows = (r: Res): Json[] => (Array.isArray(r.json) ? r.json : []);
export const message = (r: Res): string => (typeof r.json === "string" ? r.json : `${r.json?.message ?? ""} ${r.json?.msg ?? ""} ${r.json?.hint ?? ""} ${r.json?.code ?? ""}`);

/** A JWT signed with a secret the project does not know. PostgREST must reject it whatever claims it carries. */
export function forgeToken(claims: Record<string, unknown>, secret: string = randomBytes(32).toString("hex")): string {
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify({ aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated", ...claims }));
  return `${head}.${body}.${createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`;
}
/** A genuine token whose payload was edited afterwards: the signature no longer matches. */
export function tamperToken(token: string, patch: Record<string, unknown>): string {
  const [head, body, sig] = token.split(".") as [string, string, string];
  const claims = { ...JSON.parse(Buffer.from(body, "base64url").toString()), ...patch };
  return `${head}.${b64(JSON.stringify(claims))}.${sig}`;
}

/* ---- configuration ------------------------------------------------------------------------------------------------------------- */
export type DemoCreds = Record<string, { email: string; password: string }>;
export type RemoteStatus =
  | { state: "skip"; reason: string }
  | { state: "refuse"; reason: string }
  | { state: "ready"; cfg: ApiConfig; creds: DemoCreds; target: Target; dbUrl: string | null; env: Record<string, string | undefined> };

export function remoteStatus(env: Record<string, string | undefined> = loadAdminEnv(), credentialsPath = ".demo-credentials.local.json"): RemoteStatus {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { state: "skip", reason: "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set: no remote project is configured" };
  if (!existsSync(credentialsPath)) return { state: "skip", reason: `${credentialsPath} not found: provision the demo accounts first (npm run db:provision)` };
  let target: Target;
  try {
    target = projectRefFromHttpUrl(url);
    assertConfirmedProject(target, env);
  } catch (e) {
    if (e instanceof GuardError) return { state: "refuse", reason: e.message };
    throw e;
  }
  const saved = JSON.parse(readFileSync(credentialsPath, "utf8"));
  if (saved.project_ref !== target.ref) return { state: "refuse", reason: `${credentialsPath} belongs to project "${saved.project_ref}", not "${target.ref}".` };
  return { state: "ready", cfg: { url, anonKey }, creds: saved.accounts as DemoCreds, target, dbUrl: env.SUPABASE_DB_URL ?? null, env };
}

/** Prints why a suite is skipped, once, so a green run is never mistaken for a remote verification. */
export function announce(name: string, s: RemoteStatus): void {
  if (s.state === "skip") console.warn(`[remote] ${name}: SKIPPED. ${s.reason}.`);
  if (s.state === "refuse") console.error(`[remote] ${name}: REFUSING TO RUN. ${s.reason}`);
}
