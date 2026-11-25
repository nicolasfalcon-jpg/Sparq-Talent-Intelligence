# Sparq Talent Intelligence

*Connecting the right talent with the right opportunities.*

This is the production codebase for the approved V4.2 design: Next.js App Router, React 19, strict TypeScript, Tailwind v4, Radix UI, TanStack Query, Zustand, Zod, Vitest and Playwright. Supabase is planned for persistence and auth. **All data is fictional.**

## Quick start
```bash
npm install
npm run dev            # http://localhost:3000
```
- You start in the **staff workspace** as Laura Gómez (Staffing Lead).
- To see Ana Ruiz's **personal passport**, open the avatar menu and choose **My space**.

| Script | What it does |
|---|---|
| `npm run check` | Typecheck, lint, unit tests and database tests |
| `npm run build` / `start` | Production build and server |
| `npm run test:e2e` | Builds an isolated copy of the app, then runs Playwright at 1440 and 1024 (each test gets its own server; never touches `npm run dev` or `.next`). Run `npx playwright install chromium` once per Playwright version. See `docs/handoff/07-testing.md` |
| `npm run db:test` | Database tests (migrations, RLS, grants, privileged functions, seed) in an in-process Postgres (PGlite) with emulated Supabase roles |
| `npm run db:check` | Applies migrations and the seed to a disposable PGlite and prints a structural summary |
| `npm run db:seed:generate` | Regenerates `supabase/seed.sql` from the fictional fixtures |
| `npm run snapshot` | Builds and captures a static HTML snapshot of the main screens |

## What works today (phase 1)
- **Home:** stats computed from data, teams in the making, people ready for their next team, Ask Sparq card.
- **People:** plain-language search ("React Native and native iOS") interpreted into removable criteria chips, discipline and availability filters, a preview panel, a shortlist, a compare tray. All state lives in the URL.
- **Talent Passport:** every person. Evidence grouped by level, need-specific summaries, work with evidence, journey, certifications, interests, preview & export (PDF through the browser's print dialog).
- **Personal Passport:** the owner edits their summary, skills, experience and interests through validated server actions.
- **Opportunities:** status tabs and a URL-addressable details drawer with a computed requirement summary.
- **Authorization and privacy (phase 2B.1):** one policy decides who may read or change what, enforced in the data layer, queries, actions and the assistant (not only in layouts). Career interests are private unless the owner shares them. Skills and projects distinguish their **source** (professional, independent, training, learning) from their **verification** (self-reported, pending, verified); owners cannot verify and cannot remove verified evidence. Search shows the evidence basis and marks what needs confirmation. See `docs/handoff/08-authorization-and-evidence.md`.
- **Ask Sparq:** a global assistant panel. Answers are labelled **Computed from documented data** (deterministic code), **Illustrative example** (predefined V4.2 copy) or **Guidance**. It requires a session, is scoped to the signed-in user, and declines to rank, score or evaluate people (offering requirement-based alternatives). No AI model is called yet.

## Accelerated MVP (2026-11-25)
Fill a Role, Build a Team (visual canvas), delivery-lead review with explicit assignment confirmation, Compare, Planning, My Space, basic Insights, four roles, a Supabase adapter with real login, and a Claude-powered Ask Sparq with deterministic fallback. Verified in memory mode; **not yet run against Supabase or the Anthropic API**. See `docs/handoff/12-mvp-status.md`.

## What is not real yet
- **Auth** is a demo persona cookie: unsigned and client-settable, **not authentication** (it only lets you explore the two fictional workspaces).
- **Persistence** is server memory, so it resets on restart.
- **Fill a Role, Build a Team, Compare, Planning, Insights and My Space** are honest placeholders.
- **The database schema is designed but not used by the app.** `supabase/migrations/0002`–`0009` and `supabase/seed.sql` (phase 2B.2) define RLS, evidence integrity, privacy, staffing and audit, verified in PGlite with emulated Supabase roles. They have **not** been applied to any Supabase project, no app adapter exists, and the schema is **not production-ready** (see `docs/handoff/08-authorization-and-evidence.md` §9–§10). `0001` is the superseded original draft, kept unchanged; do not apply it on its own.
- **Verified 2026-11-24** (see `docs/handoff/07-testing.md`): typecheck, lint, 265 unit tests, 262 database tests and 62 E2E tests pass.

Details: `docs/handoff/01-capability-assessment.md` and `05-gap-analysis.md`.

## Repository map
```
src/app/              routes ((staff), (personal), api/assistant, persona, portraits)
src/features/         home · people · passport · opportunities · shortlist · ask-sparq · shell
src/design-system/    tokens, primitives, overlays, icons, portraits
src/domain/           Zod schemas + pure rules
src/data/             fixtures (fictional) + repositories
supabase/migrations/  0001 original draft (history) · 0002-0009 additive schema, RLS, functions; seed.sql generated
tests/db/             database tests (PGlite)
tests/                unit (Vitest) · e2e (Playwright)
docs/handoff/         engineering handoff + screenshots
design-reference/v4.2 approved prototype source (reference only)
```
