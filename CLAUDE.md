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
npm run check        # typecheck + lint + unit tests + DB tests
npm run build
npm run test:e2e     # builds an isolated copy, then runs Playwright (1440 + 1024). First time: npx playwright install chromium
npm run db:test      # 262 DB tests: migrations, RLS, grants, privileged functions, seed (PGlite, emulated Supabase roles)
npm run db:check     # applies migrations + seed in PGlite and prints a structural summary
npm run db:seed:generate  # regenerates supabase/seed.sql from the fixtures
```

## Architecture (keep these boundaries)
```
src/domain/        Zod contracts + pure business rules + the authorization policy (policy.ts) + the assistant policy (talent-policy.ts). No React, no I/O.
src/data/          fixtures (FICTIONAL) + repositories (interfaces, memory adapter, UNSCOPED) + scoped.ts (actor-scoped, privacy-aware reads). Server-only entry: getRepositories()
src/features/<x>/  queries.ts (server view-models) · actions.ts ("use server", Zod + requireRole) · *.tsx UI
src/design-system/ tokens.css + primitives/overlays/icons/Portrait. Presentation only.
src/app/           routes. (staff) and (personal) route groups are role-guarded by AppFrame.
```
- Pages are Server Components and read through feature **queries** (`features/<x>/queries.ts`), which take the viewer, authorize with `assertAllowed` and read via `scopedTalent(repos, actor)`. Pages and routes must NOT import repositories (ESLint enforces it) and never import `src/data/fixtures`.
- **Authorization lives in one place**: `src/domain/policy.ts`. Never re-implement a role check in a component or page; a layout redirect is UX, not protection. Private data is excluded when it is *selected* (`scoped.ts`), not hidden in JSX: whatever reaches a client component is serialized to the page.
- **Session**: `src/lib/session.ts` is the only "who is calling?" seam (`getSession`, `requireSession`, `getSessionUser`). It is strict: no cookie, no session. The demo persona cookie is **not authentication**; real auth replaces only `getSession()`. See `docs/handoff/08-authorization-and-evidence.md`.
- Mutations go through server actions: Zod-validate the input, `requireSession` + `assertAllowed`, apply the domain rule, call the repository, then `revalidatePath`. Actions always RETURN a typed `{ ok, error }` result: they catch `ForbiddenError` and unexpected failures, never throw to the client.
- Zustand (`src/lib/ui-store.ts`) holds UI state only (assistant panel, compare tray). Business data never goes in it.
- URL state for anything shareable (filters, selection, drawers): `?q= ?disc= ?soon= ?sel= ?open= ?status=`.
- Ask Sparq goes through `/api/assistant`: session required (401), strict Zod body, then `resolveAssistantRequest` authorizes context/suggestion/subject (client values are untrusted), then `AssistantGateway.answer(request, actor)` (user-aware; reads only through `scopedTalent`). Answers carry `provenance`: `computed` · `illustrative` · `fallback`; declined requests also carry `policy`. Never present illustrative or computed output as AI.

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
- **Evidence: source ≠ verification.** `level` is the evidence *source* (professional/independent/training/emerging); `verification` is `self_reported | pending | verified`. Owners only ever create `self_reported` rows, can never set verification, and cannot remove or alter `verified` evidence. Missing evidence is "not documented", never "no". Never present self-reported or pending claims as confirmed.
- **Discovery is evidence-aware and transparent**: order per requested requirement (verified first, independent stays valuable), show the evidence basis, never a score or a generalized rank.
- **Career goals and learning interests are private by default**; only labels the owner voluntarily shares reach staffing; exports and assistant answers never include them. Opportunity interest is a separate, future concept.
- **Ask Sparq must not** rank, score, name the "weakest", infer personal traits, or make staffing/assignment decisions (`domain/talent-policy.ts`: deterministic, heuristic, documented limits). It offers requirement-based alternatives instead.
- Passport exports must notify the owner (phase 2).
- Be explicit about what is simulated. The demo persona cookie is not auth, and the in-memory store is not persistence. The database (phase 2B.2) is designed and tested in PGlite only: not applied to any Supabase project, not used by the app, not production-ready.

## Database rules (supabase/migrations)
- **Never edit an existing migration** (0001's hash is pinned by a test); add a new one. Never apply `0001` alone. `legacy_0001` and `private` must never be exposed by the API; only `public` is.
- New tables in `public` get no privileges by default: add RLS, column-level GRANTs and policies in the same change, plus a test. Roles come from `user_roles`, never from the JWT. `anon` and `service_role` get nothing on app tables.
- Privileged changes (roles, verification, proposal state, reviews, assignments, audit) are `SECURITY DEFINER` functions only: `set search_path = ''`, schema-qualified, EXECUTE revoked from PUBLIC/anon/service_role, actor = `auth.uid()` (never a parameter), audit row written, denial checks written `… is not true` (a NULL does not trip `if not x`). Roles never imply access on their own: relationships (assignment, approved proposal) are explicit.
- Policies on a table must not look the same row up by id (`INSERT … RETURNING` cannot see it): use the row's own columns.
- DB tests run in PGlite with emulated Supabase roles; they are not proof about real Supabase. Do not weaken them; db changes must keep `npm run db:test` green. Docs: `docs/handoff/04` §7–§13, `08` §7–§10.

## Testing rules
- Every rule above has a test: `policy`, `authz`, `privacy`, `evidence`, `evidence-actions`, `assistant`, `talent-policy` (unit) and `security-and-privacy` (E2E). When you change a rule, change its test, never weaken it.
- E2E specs import `test`/`expect` from `tests/e2e/fixtures.ts` (never `@playwright/test`): every test gets its own server, so mutating tests need no cleanup. No `.first()` to hide duplicates; make bounds checks two-sided; wait for visibility before touching streamed content. Details: `docs/handoff/07-testing.md`.
- Don't run `npm run build` while `npm run dev` is running (both write `.next`); `npm run test:e2e` builds elsewhere and is safe.

## Current state & next tasks
Built: shell, Home, People, Talent Passport (staff and personal), Opportunities, Ask Sparq (rule-based, user-aware, policy-bound). Phase 2B.1 (authorization, evidence model, privacy, assistant policy) is done in memory. Phase 2B.2 (database schema, RLS, functions, seed, 262 DB tests) is done in PGlite only; the app still uses the memory adapter.
Placeholders, with honest "Planned" pages: Fill a Role, Build a Team, Compare, Planning, Insights, My Space.
Next, in order (see `docs/handoff/06-roadmap.md`):
1. ~~Run the Playwright suite~~ Done (phase 2A/2A.1): 34 E2E tests pass, repeatably. See `docs/handoff/07-testing.md` for status and known limitations.
2. Phase 2C (needs explicit authorization): re-verify the schema on a real Supabase local stack, then the Supabase adapter and SSO auth (replaces `getSession()` only). Prerequisites: `08` §10.
3. Fill a Role, then Build a Team (React Flow), then Compare, Planning, My Space.
4. LLM gateway for Ask Sparq.
