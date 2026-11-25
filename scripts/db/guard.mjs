// Safety guard shared by every admin script and the remote tests: they only ever run against a project that a human has
// explicitly CONFIRMED to be the dedicated fictional-data project, or against a local database.
//
//   SPARQ_CONFIRM_FICTIONAL_PROJECT=<project ref>   must equal the ref derived from the connection target
//
// Nothing here prints credentials: only the project ref and the host are ever shown.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export class GuardError extends Error {}

/** Project ref from a Postgres URL: `postgres.<ref>@…pooler.supabase.com` (pooler) or `db.<ref>.supabase.co` (direct). "local" for localhost. */
export function projectRefFromDbUrl(dbUrl) {
  let u;
  try { u = new URL(dbUrl); } catch { throw new GuardError("SUPABASE_DB_URL is not a valid connection URL."); }
  const host = u.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host)) return { ref: "local", host, local: true };
  const direct = /^db\.([a-z0-9]{10,})\.supabase\.co$/.exec(host);
  if (direct) return { ref: direct[1], host, local: false };
  const user = decodeURIComponent(u.username);
  if (host.endsWith(".pooler.supabase.com") && /^postgres\.[a-z0-9]{10,}$/.test(user)) return { ref: user.slice("postgres.".length), host, local: false };
  throw new GuardError(`Cannot derive a Supabase project ref from the database host "${host}". Refusing to run: use the project's direct or pooler connection string.`);
}

/** Project ref from the project's HTTP URL: `https://<ref>.supabase.co`. "local" for localhost / 127.0.0.1. */
export function projectRefFromHttpUrl(httpUrl) {
  let u;
  try { u = new URL(httpUrl); } catch { throw new GuardError("NEXT_PUBLIC_SUPABASE_URL is not a valid URL."); }
  const host = u.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host)) return { ref: "local", host, local: true };
  const m = /^([a-z0-9]{10,})\.supabase\.co$/.exec(host);
  if (m) return { ref: m[1], host, local: false };
  throw new GuardError(`"${host}" is not a <ref>.supabase.co project URL. Refusing to run.`);
}

/** Throws unless the target is local, or the human confirmed exactly this project ref. */
export function assertConfirmedProject(target, env) {
  if (target.local) return;
  const confirmed = (env.SPARQ_CONFIRM_FICTIONAL_PROJECT ?? "").trim();
  if (!confirmed) {
    throw new GuardError(
      `Target project "${target.ref}" has not been confirmed. This tooling may only touch the dedicated FICTIONAL-data project.\n` +
      `If "${target.ref}" is that project, run again with SPARQ_CONFIRM_FICTIONAL_PROJECT=${target.ref}.`);
  }
  if (confirmed !== target.ref) {
    throw new GuardError(`SPARQ_CONFIRM_FICTIONAL_PROJECT ("${confirmed}") does not match the target project ("${target.ref}"). Refusing to run.`);
  }
}
