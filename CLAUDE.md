# CLAUDE.md — working on Sparq Talent Intelligence

Sparq Talent Intelligence is a staffing and talent product: Talent Passports, plain-language people search, opportunities, and team composition. The approved design is **V4.2**. This is a real Next.js app, now in phase 1 (foundation).

## Read first
- `docs/handoff/00-index.md`: the full handoff (design system, functional spec, data model, gap analysis, roadmap).
- `design-reference/v4.2/screens/*.dc.html`: exact visual and behavioral source for any screen you build. It's a reference, not runnable.
- `docs/handoff/screenshots/v4.2-approved/`: what "done" looks like.

## Commands
```bash
npm install
npm run dev          # http://localhost:3000 (staff workspace; switch to "My space" from the avatar menu)
npm run check        # typecheck + lint + unit tests
npm run build
npm run test:e2e     # builds an isolated copy, then runs Playwright (1440 + 1024). First time: npx playwright install chromium
npm run db:check     # validates supabase/migrations in PGlite
```

## Architecture (keep these boundaries)
```
src/domain/        Zod contracts + pure business rules. No React, no I/O.
src/data/          fixtures (FICTIONAL) + repositories (interfaces, memory adapter). Server-only entry: getRepositories()
src/features/<x>/  queries.ts (server view-models) · actions.ts ("use server", Zod + requireRole) · *.tsx UI
src/design-system/ tokens.css + primitives/overlays/icons/Portrait. Presentation only.
src/app/           routes. (staff) and (personal) route groups are role-guarded by AppFrame.
```
- Pages are Server Components and read through `getRepositories()`. Never import `src/data/fixtures` from UI (ESLint enforces this).
- Mutations go through server actions: Zod-validate the input, check the role with `requireRole`, call the repository, then `revalidatePath`. Actions always RETURN a typed `{ ok, error }` result: they catch `ForbiddenError` and unexpected failures, never throw to the client.
- Zustand (`src/lib/ui-store.ts`) holds UI state only (assistant panel, compare tray). Business data never goes in it.
- URL state for anything shareable (filters, selection, drawers): `?q= ?disc= ?soon= ?sel= ?open= ?status=`.
- Ask Sparq goes through `/api/assistant` → `AssistantGateway`. Answers carry `provenance`: `computed` · `illustrative` · `fallback`. Never present illustrative or computed output as AI.

## Design fidelity rules
- Use tokens (`bg-surface-muted`, `rounded-card`, `shadow-card`, `text-mute`…). Don't hard-code new hex values. Add a token to `tokens.css` if one is truly missing.
- Coral **buttons** use `coral-strong` (#CF4529) for contrast. `coral` (#F15B40) is for brand marks, badges, the FAB and the focus ring.
- Display headings: light (300) text plus a medium (500) emphasis span.
- Reuse `Pill`/`pillClass`, `Drawer`, `Modal`, `Portrait`, `EvidenceDot`, `SkillChip`. Don't bring in default-styled component libraries.
- Check every new screen at 1440 and 1024 against the V4.2 screenshot.
- Never remove the focus ring. Inputs inside a pill use `.focus-ring-within` on the container (see `globals.css`); other fields keep the global coral `:focus-visible` ring. Don't add `outline-none` to an input without one of these.
- Breakpoints are strict (`max-xl` = below 1180, `max-lg` = below 960, `max-md` = below 900). Tailwind v4 centres with the `translate` property: to cancel it reset `--tw-translate-x/y`, not `transform`/`translate: none`.

## Product guardrails (non-negotiable)
- **No scores, ranks or percentages about people.** Order by documented evidence and say so in the UI.
- **Proposed ≠ assigned.** Only a human review creates assignments.
- **Fictional data only** in fixtures, tests, seeds and screenshots.
- Career interests are private to the person. Passport exports must notify the owner (phase 2).
- Be explicit about what is simulated. The demo persona cookie is not auth, and the in-memory store is not persistence.

## Testing rules
- E2E specs import `test`/`expect` from `tests/e2e/fixtures.ts` (never `@playwright/test`): every test gets its own server, so mutating tests need no cleanup. No `.first()` to hide duplicates; make bounds checks two-sided; wait for visibility before touching streamed content. Details: `docs/handoff/07-testing.md`.
- Don't run `npm run build` while `npm run dev` is running (both write `.next`); `npm run test:e2e` builds elsewhere and is safe.

## Current state & next tasks
Built: shell, Home, People, Talent Passport (staff and personal), Opportunities, Ask Sparq (rule-based).
Placeholders, with honest "Planned" pages: Fill a Role, Build a Team, Compare, Planning, Insights, My Space.
Next, in order (see `docs/handoff/06-roadmap.md`):
1. ~~Run the Playwright suite~~ Done (phase 2A/2A.1): 34 E2E tests pass, repeatably. See `docs/handoff/07-testing.md` for status and known limitations.
2. Supabase adapter, seed, and SSO auth.
3. Fill a Role, then Build a Team (React Flow), then Compare, Planning, My Space.
4. LLM gateway for Ask Sparq.
