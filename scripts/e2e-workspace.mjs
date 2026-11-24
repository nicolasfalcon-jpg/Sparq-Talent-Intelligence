// Shared by scripts/e2e-build.mjs and the Playwright fixtures (tests/e2e/fixtures.ts).
// The E2E suite builds and serves a COPY of the app from a workspace outside the repository, so it can
// never overwrite the `.next` directory of a running `next dev`, nor touch tracked files such as tsconfig.json.
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Deterministic per-checkout directory, e.g. /tmp/sparq-e2e-3f9a1c0b2d. Override with E2E_WORKSPACE. */
export function workspaceDir() {
  if (process.env.E2E_WORKSPACE) return resolve(process.env.E2E_WORKSPACE);
  return join(tmpdir(), `sparq-e2e-${createHash("sha1").update(repoRoot).digest("hex").slice(0, 10)}`);
}
