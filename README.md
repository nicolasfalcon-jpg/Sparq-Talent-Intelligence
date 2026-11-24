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
| `npm run check` | Typecheck, lint and unit tests (Vitest) |
| `npm run build` / `start` | Production build and server |
| `npm run test:e2e` | Playwright (run `npx playwright install chromium` once) |
| `npm run db:check` | Applies `supabase/migrations` to an in-process Postgres (PGlite) |
| `npm run snapshot` | Builds and captures a static HTML snapshot of the main screens |

## What works today (phase 1)
- **Home:** stats computed from data, teams in the making, people ready for their next team, Ask Sparq card.
- **People:** plain-language search ("React Native and native iOS") interpreted into removable criteria chips, discipline and availability filters, a preview panel, a shortlist, a compare tray. All state lives in the URL.
- **Talent Passport:** every person. Evidence grouped by level, need-specific summaries, work with evidence, journey, certifications, interests, preview & export (PDF through the browser's print dialog).
- **Personal Passport:** the owner edits their summary, skills, experience and interests through validated server actions.
- **Opportunities:** status tabs and a URL-addressable details drawer with a computed requirement summary.
- **Ask Sparq:** a global assistant panel. Answers are labelled **Computed from documented data** (deterministic code), **Illustrative example** (predefined V4.2 copy) or **Guidance**. No AI model is called yet.

## What is not real yet
- **Auth** is a demo persona cookie.
- **Persistence** is server memory, so it resets on restart.
- **Fill a Role, Build a Team, Compare, Planning, Insights and My Space** are honest placeholders.
- **E2E tests** are written but haven't been executed yet.

Details: `docs/handoff/01-capability-assessment.md` and `05-gap-analysis.md`.

## Repository map
```
src/app/              routes ((staff), (personal), api/assistant, persona, portraits)
src/features/         home · people · passport · opportunities · shortlist · ask-sparq · shell
src/design-system/    tokens, primitives, overlays, icons, portraits
src/domain/           Zod schemas + pure rules
src/data/             fixtures (fictional) + repositories
supabase/migrations/  proposed schema + RLS (phase 2)
tests/                unit (Vitest) · e2e (Playwright)
docs/handoff/         engineering handoff + screenshots
design-reference/v4.2 approved prototype source (reference only)
```
