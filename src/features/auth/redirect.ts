/**
 * Same-origin redirect targets only. `next` comes from the query string, so it is untrusted: anything that could leave this
 * site (absolute URLs, protocol-relative `//host`, backslash tricks, encoded or control characters) is rejected.
 * Pure: shared by the middleware and the login action.
 */
const BASE = "http://sparq.invalid";

export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try { url = new URL(raw, BASE); } catch { return null; }
  if (url.origin !== BASE) return null;
  const path = url.pathname;
  if (path === "/login" || path.startsWith("/login/") || path === "/logout" || path.startsWith("/api")) return null;
  return path + url.search;
}
