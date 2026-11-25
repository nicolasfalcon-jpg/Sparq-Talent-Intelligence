#!/usr/bin/env node
// Provisions the 7 controlled DEMO accounts in Supabase Auth through the Admin API. Nothing else: there is no public registration.
//
//   node scripts/db/provision.mjs --dry-run     show what would be created (no network)
//   node scripts/db/provision.mjs               create missing accounts; update metadata of existing ones (passwords untouched)
//   node scripts/db/provision.mjs --rotate      also issue NEW passwords for existing accounts
//
// Order of a fresh setup:  migrate  →  provision  →  seed   (see docs/handoff/09-supabase-setup.md)
//   npm run db:migrate    then    npm run db:provision    then    npm run db:seed
//
// SECURITY: this script uses SUPABASE_SERVICE_ROLE_KEY. That key is an ADMIN credential: it lives in .env.admin.local (gitignored) or the
// process environment, is read ONLY by scripts/db and tests/remote, and must never be given to the application runtime (a test fails if
// anything under src/ mentions it). Generated passwords are written to .demo-credentials.local.json (mode 0600, gitignored) and are
// never printed. The account ids are the fixed UUIDs the seed refers to, so the seed attaches roles and profiles to exactly these users.
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadAdminEnv } from "./env.mjs";
import { GuardError, assertConfirmedProject, projectRefFromHttpUrl } from "./guard.mjs";
import { DEMO_USERS, demoEmail, userId } from "./seed-users.mjs";

export class ProvisionError extends Error {
  constructor(message, options) { super(message, options); this.name = "ProvisionError"; }
}

export const defaultPassword = () => randomBytes(18).toString("base64url"); // 144 bits

export const CREDENTIALS_FILE = ".demo-credentials.local.json";

export function planAccounts() {
  return DEMO_USERS.map((u) => ({ key: u.key, id: userId(u.key), email: demoEmail(u.key), name: u.name, role: u.roles[0] }));
}

/**
 * Creates or updates the accounts. `fetchImpl` and `write`/`read` are injectable so the logic is tested against a local fake server
 * without touching any real project. Returns { created, existing, rotated, dryRun } (keys only: never secrets).
 */
export async function provision({
  env, fetchImpl = fetch, credentialsPath = CREDENTIALS_FILE, dryRun = false, rotate = false, log = () => {}, randomPassword = defaultPassword,
}) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new ProvisionError("NEXT_PUBLIC_SUPABASE_URL is not set.");
  const target = projectRefFromHttpUrl(url);
  assertConfirmedProject(target, env);
  const accounts = planAccounts();
  log(`Target: project "${target.ref}" (${target.host})${target.local ? " [local]" : " [confirmed fictional-data project]"}`);

  if (dryRun) {
    for (const a of accounts) log(`  would provision ${a.key.padEnd(7)} ${a.email.padEnd(32)} ${a.role.padEnd(13)} ${a.id}`);
    return { created: [], existing: [], rotated: [], dryRun: true };
  }
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new ProvisionError("SUPABASE_SERVICE_ROLE_KEY is not set. It is an ADMIN credential: put it in .env.admin.local (gitignored), never in the app environment.");
  const base = url.replace(/\/+$/, "");
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  const call = async (method, path, body) => {
    const res = await fetchImpl(`${base}/auth/v1/admin/users${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000) });
    let json = null;
    try { json = await res.json(); } catch { /* empty body */ }
    return { status: res.status, ok: res.ok, json };
  };
  const fail = (what, r) => new ProvisionError(`${what} failed (HTTP ${r.status}${r.json?.msg || r.json?.error_code ? `: ${r.json.msg ?? r.json.error_code}` : ""}).`);

  let creds = { project_ref: target.ref, accounts: {} };
  if (existsSync(credentialsPath)) {
    const prev = JSON.parse(readFileSync(credentialsPath, "utf8"));
    if (prev.project_ref !== target.ref) throw new ProvisionError(`${credentialsPath} belongs to project "${prev.project_ref}", not "${target.ref}". Move it away, or fix the target.`);
    creds = { project_ref: target.ref, accounts: prev.accounts ?? {} };
  }

  const out = { created: [], existing: [], rotated: [], dryRun: false };
  let dirty = false;
  for (const a of accounts) {
    const meta = { display_name: a.name, demo: true, fictional: true };
    const got = await call("GET", `/${a.id}`);
    if (got.status === 404) {
      const password = randomPassword();
      const r = await call("POST", "", { id: a.id, email: a.email, password, email_confirm: true, user_metadata: meta, app_metadata: { provider: "email", providers: ["email"] } });
      if (!r.ok) throw fail(`Creating ${a.key}`, r);
      creds.accounts[a.key] = { email: a.email, password };
      dirty = true;
      out.created.push(a.key);
      log(`  created   ${a.key}`);
    } else if (got.ok) {
      if (got.json?.email && got.json.email !== a.email) throw new ProvisionError(`Account ${a.key} exists with a different email than expected; refusing to touch it.`);
      const body = { user_metadata: meta };
      if (rotate) { const password = randomPassword(); body.password = password; creds.accounts[a.key] = { email: a.email, password }; dirty = true; }
      const r = await call("PUT", `/${a.id}`, body);
      if (!r.ok) throw fail(`Updating ${a.key}`, r);
      out.existing.push(a.key);
      if (rotate) out.rotated.push(a.key);
      log(`  ${rotate ? "rotated  " : "exists   "} ${a.key}${!rotate && !creds.accounts[a.key] ? "  (no saved password: run with --rotate to issue a new one)" : ""}`);
    } else {
      throw fail(`Looking up ${a.key}`, got);
    }
  }
  if (dirty) {
    writeFileSync(credentialsPath, JSON.stringify(creds, null, 2) + "\n", { mode: 0o600 });
    chmodSync(credentialsPath, 0o600);
    log(`Credentials saved to ${credentialsPath} (mode 0600, gitignored). They are not printed.`);
  }
  log("Next: apply the application rows with `npm run db:seed` (migrations must already be applied).");
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const unknown = argv.filter((a) => !["--dry-run", "--rotate"].includes(a));
  if (unknown.length) throw new ProvisionError(`Unknown option(s): ${unknown.join(", ")}`);
  await provision({ env: loadAdminEnv(), dryRun: argv.includes("--dry-run"), rotate: argv.includes("--rotate"), log: (m) => console.log(m) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e instanceof ProvisionError || e instanceof GuardError ? `\n${e.message}` : `\nUnexpected failure: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
