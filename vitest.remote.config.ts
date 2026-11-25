import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// REMOTE integration tests: real GoTrue tokens against the dedicated FICTIONAL-data Supabase project, through PostgREST over HTTP.
// Run with `npm run test:remote`. They skip (loudly) when the project is not configured, and refuse to run unless
// SPARQ_CONFIRM_FICTIONAL_PROJECT matches the project ref. They are NOT part of `npm run check`. Files run one after another:
// they share one remote database.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", globals: true, include: ["tests/remote/**/*.test.ts"], testTimeout: 60_000, hookTimeout: 120_000, fileParallelism: false },
});
