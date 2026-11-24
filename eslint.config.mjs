import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  { ignores: [".next/**", "node_modules/**", "design-reference/**", "playwright-report/**", "test-results/**", "snapshot/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Architecture guard: UI must read data through repositories, never fixtures.
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@/data/fixtures/*"], message: "Import data through a repository (src/data/repositories), never fixtures directly." }],
      }],
    },
  },
  { files: ["src/data/**", "tests/**"], rules: { "no-restricted-imports": "off" } },
  {
    // Authorization boundary: pages and route handlers read through feature queries / services (which authorize),
    // never through repositories directly.
    files: ["src/app/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["@/data/fixtures/*"], message: "Import data through a repository (src/data/repositories), never fixtures directly." },
          { group: ["@/data/repositories", "@/data/repositories/*"], message: "Pages and routes must not read repositories directly: use a feature query or service, which authorizes the viewer." },
        ],
      }],
    },
  },
];

export default config;
