# 01 · Engineering capability assessment & stack decision

Assessed on 2026-11-24 in the environment that produced this repository: a Linux sandbox with Node.js 22 and npm 10, access to the npm registry, and **no** access to browser binaries, OS package mirrors or external databases.

## 1. Answers

| Question | Answer | Evidence in this repo |
|---|---|---|
| Can the V4.2 components, layouts, assets and interaction logic be reused directly? | **Partially, by translation rather than copy.** The V4.2 source is a proprietary `.dc.html` format (template holes, `sc-if`/`sc-for`, a `DCLogic` runtime and `support.js`) that won't run outside Claude Design. Exact values (tokens, SVG paths, copy, layouts, data) were extracted and re-implemented as typed React components. | `src/design-system/*`, `src/data/fixtures/*`, `design-reference/v4.2/` |
| Can a real application project be initialized and maintained here? | **Yes.** | This repo |
| Install dependencies, use modern JS frameworks? | **Yes** (npm registry reachable). | `package.json`, `package-lock.json` |
| Real routing, reusable components, state management, business logic? | **Yes.** Next.js App Router, Zustand for UI state, server actions plus repositories for business state, pure domain rules. | `src/app`, `src/lib/ui-store.ts`, `src/domain/rules.ts` |
| Backend services, authentication, database, persistence? | **Designed and stubbed, not connected.** Route handlers and server actions are real. Persistence is an in-memory server store, so data resets on restart. The Supabase schema and RLS exist and pass an SQL validity check in PGlite, but no Supabase project, network database or auth provider was available. Authentication is a **demo persona cookie**, not security. | `src/data/repositories/memory.ts`, `supabase/migrations/*`, `scripts/check-schema.mjs`, `src/lib/session.ts` |
| Run the app, automated tests, fix errors? | **Mostly.** `tsc`, ESLint, Vitest (38 tests), `next build` and `next start` with HTTP smoke checks all ran here. **Playwright could not run**: the browser download is blocked in this sandbox. The E2E specs are written but **not executed**. A static server-rendered snapshot was reviewed visually instead. | `tests/unit/*`, `tests/e2e/phase1.spec.ts`, `scripts/static-snapshot.sh` |
| Export a complete standalone repository? | **Yes.** It ships as a zip (no `node_modules`) with a lockfile. | `sparq-talent-intelligence.zip` |
| Can it be continued in Claude Code? | **Yes.** `CLAUDE.md` gives conventions, commands, guardrails and the next tasks. | `CLAUDE.md`, `docs/handoff/06-roadmap.md` |

## 2. Done directly vs needs an external engineering environment

**Done here:** project setup, architecture, design tokens and primitives, the app shell and navigation, typed domain contracts, the fictional dataset behind a replaceable repository layer, Home, People, Talent Passport (staff and personal), Opportunities, the Ask Sparq gateway seam with deterministic answers, unit tests, a production build, a Supabase schema draft.

**Needs an external environment (your machine, CI or cloud):**
1. Running Playwright E2E tests and visual-regression screenshots (`npx playwright install chromium`).
2. Creating the Supabase project, applying migrations, configuring Auth (SSO/SAML for the company IdP) and testing RLS with real JWTs.
3. Choosing and connecting an LLM provider for Ask Sparq through a server-side gateway, with secrets in a vault.
4. Hosting (Vercel or a container platform), environment secrets, observability, backups.
5. Security review, privacy/DPIA review (people data), accessibility audit with assistive technology.

## 3. Stack decision

The preferred stack is **supported and adopted**. Next.js was available, so the Vite alternative wasn't needed.

| Preference | Adopted | Notes |
|---|---|---|
| Next.js App Router + React | ✅ Next 15.5, React 19 | Next 16 was the latest release, but 15.x was chosen for ecosystem maturity (eslint-config-next, testing libraries). Upgrading is a contained task (see roadmap). |
| TypeScript strict | ✅ `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride` | |
| Tailwind CSS | ✅ v4, tokens in `@theme` | No component-library styling. All visuals are V4.2 tokens. |
| Radix UI | ✅ Dialog, Popover (DropdownMenu installed) | Accessible behavior, Sparq styling. |
| TanStack Query | ✅ for Ask Sparq mutations | Server Components handle reads. TanStack is for client-initiated async work. |
| Zustand | ✅ UI-only state (assistant panel, compare tray) | Business state never lives in Zustand. |
| PostgreSQL + Supabase | ◐ Schema and RLS drafted and validated in PGlite; adapter not built | Phase 2. |
| Zod | ✅ Domain contracts, server-action and API validation | |
| React Flow | ◐ Recommended for the Build a Team canvas, with layout spec in the design system doc | Phase 2. Not installed yet, to keep phase 1 lean. |
| Vitest + Playwright | ✅ Vitest running · ◐ Playwright configured, specs written, not executed | |

**Trade-off considered (Vite SPA):** a Vite SPA would make static hosting simpler, but you'd lose server components, server actions, route-level authorization and a server-side AI gateway. Those matter for people data and keeping LLM keys off the client. Next.js stays the right choice.

## 4. Honesty statement

The phase-1 app does **not** have real authentication, persistent storage, or any AI model.
- "Computed from documented data" answers come from deterministic code over the fictional dataset.
- "Illustrative example" answers are predefined V4.2 copy.
- Shortlists and passport edits persist only while the server process runs.
- PDF export uses the browser's print dialog. Word and one-page exports are marked as planned.
