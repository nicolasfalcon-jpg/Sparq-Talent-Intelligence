import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Database tests run migrations on a disposable in-process PostgreSQL (PGlite) under realistic Supabase-like roles.
// Separate from the unit config: Node environment, longer timeouts, no jsdom.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", globals: true, include: ["tests/db/**/*.test.ts"], testTimeout: 60_000, hookTimeout: 120_000 },
});
