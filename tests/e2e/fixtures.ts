/**
 * E2E fixtures: every test gets its OWN production server process.
 *
 * Why: the app keeps its (fictional) data in server memory, so tests that add skills or shortlist people
 * would otherwise leak state into each other, across viewport projects and across repeated runs.
 * A fresh server per test starts from the pristine dataset by construction, so results do not depend on
 * execution order, worker count or previous runs, and no reset endpoint is needed.
 *
 * Isolation from the developer's session: the server is started from the copy built by
 * scripts/e2e-build.mjs (a workspace outside the repo), on an OS-assigned port, bound to 127.0.0.1.
 * It never uses port 3000 and never reads or writes the repo's `.next` directory.
 */
import { test as base, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { repoRoot, workspaceDir } from "../../scripts/e2e-workspace.mjs";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

async function waitUntilReady(url: string, child: ChildProcess, logs: () => string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Test server exited early (code ${child.exitCode}).\n${logs()}`);
    try {
      const res = await fetch(`${url}/portraits/ana`);
      if (res.ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Test server did not become ready in 30s.\n${logs()}`);
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((r) => child.once("exit", () => r()));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
  await exited;
  clearTimeout(timer);
}

// The second fixture argument is named `provide` (not Playwright's usual `use`) so the react-hooks lint rule does not mistake it for a hook.
type Fixtures = { appServer: { url: string } };

export const test = base.extend<Fixtures>({
  appServer: async ({}, provide) => {
    const ws = workspaceDir();
    if (!existsSync(join(ws, ".next", "BUILD_ID"))) {
      throw new Error(`No E2E build found in ${ws}. Run the suite with \`npm run test:e2e\` (it builds first) or \`node scripts/e2e-build.mjs\`.`);
    }
    const port = await freePort();
    const url = `http://127.0.0.1:${port}`;
    let output = "";
    const child = spawn(process.execPath, [join(repoRoot, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
      cwd: ws,
      env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (d) => (output += String(d)));
    child.stderr?.on("data", (d) => (output += String(d)));
    try {
      await waitUntilReady(url, child, () => output);
      await provide({ url });
    } finally {
      await stop(child);
    }
  },
  baseURL: async ({ appServer }, provide) => {
    await provide(appServer.url);
  },
});

export { expect };
