import { existsSync, readFileSync } from "node:fs";

/** Parses KEY=VALUE lines (comments, blank lines, optional single/double quotes). No expansion, no dependency. */
export function parseEnvFile(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/**
 * ADMIN environment: the process environment wins, then `.env.admin.local` (gitignored). Administrative credentials
 * (SUPABASE_DB_URL, SUPABASE_SERVICE_ROLE_KEY) live only here and are read only by scripts/db and tests/remote, never by the app.
 */
export function loadAdminEnv(env = process.env, file = ".env.admin.local") {
  const fromFile = existsSync(file) ? parseEnvFile(readFileSync(file, "utf8")) : {};
  return { ...fromFile, ...Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)) };
}
