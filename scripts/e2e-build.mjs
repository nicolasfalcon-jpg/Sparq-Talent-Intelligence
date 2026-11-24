// Builds the production app for the E2E suite inside an isolated workspace (see e2e-workspace.mjs).
// Runs automatically before `npm run test:e2e` (npm "pre" hook). Nothing in the repository is written:
// the source is copied out, node_modules is symlinked, and `next build` runs in the copy.
import { cpSync, existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { repoRoot, workspaceDir } from "./e2e-workspace.mjs";

const ws = workspaceDir();
mkdirSync(ws, { recursive: true });

// Fresh copy of the sources on every run (the `.next` cache inside the workspace is kept for fast rebuilds).
for (const dir of ["src", "public"]) {
  rmSync(join(ws, dir), { recursive: true, force: true });
  cpSync(join(repoRoot, dir), join(ws, dir), { recursive: true });
}
for (const file of ["package.json", "package-lock.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs", "eslint.config.mjs"]) {
  cpSync(join(repoRoot, file), join(ws, file));
}

const modules = join(ws, "node_modules");
const target = join(repoRoot, "node_modules");
const linked = existsSync(modules) && lstatSync(modules).isSymbolicLink() && readlinkSync(modules) === target;
if (!linked) {
  rmSync(modules, { recursive: true, force: true });
  symlinkSync(target, modules, "dir");
}

console.log(`[e2e-build] workspace: ${ws}`);
const res = spawnSync(process.execPath, [join(target, "next", "dist", "bin", "next"), "build"], {
  cwd: ws,
  stdio: "inherit",
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
process.exit(res.status ?? 1);
