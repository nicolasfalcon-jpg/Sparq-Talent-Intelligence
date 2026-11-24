import { defineConfig, devices } from "@playwright/test";

/**
 * There is deliberately NO `webServer` and NO fixed `baseURL` here.
 * Each test starts its own isolated production server (tests/e2e/fixtures.ts) from a build made by
 * `npm run test:e2e` (scripts/e2e-build.mjs) in a workspace outside the repository. See docs/handoff/07-testing.md.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: { trace: "on-first-retry" },
  projects: [
    { name: "desktop-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "laptop-1024", use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } } },
  ],
});
