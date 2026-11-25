# 07 · Testing, environments and verification status

Last verified: **2026-11-24** (phase 2B.2; baseline established in 2A.1). Everything in the "verified" column below was executed in that session; anything not listed was not run. `npm run check` now also runs the DB tests.

## 1. Verification status

| Check | Result | Notes |
|---|---|---|
| `npm run typecheck` | ✅ pass | `tsc --noEmit`, strict |
| `npm run lint` | ✅ pass | ESLint 9, no errors or warnings |
| `npm run db:test` | ✅ 262 / 262 | 10 files in `tests/db`: migrations, schema catalog, seed, constraints, availability, and RLS/grants/functions under real role switching. PGlite with **emulated** Supabase roles, not a real Supabase (§9) |
| `npm run db:check` | ✅ pass | 20 tables, 0 without RLS, 49 policies, 13 RPC functions, 0 reachable by anon, 12 seeded profiles |
| `npm run test` (Vitest) | ✅ 265 / 265 | 12 files. Phase 2A.1 had 55; 2B.1 adds authorization, evidence, privacy, assistant and policy tests (see below) |
| Production build | ✅ pass | Built by `npm run test:e2e` in the isolated workspace (§4). Same sources, config and lint/type gate as `npm run build`. |
| `npm run test:e2e` (Playwright) | ✅ 62 / 62, twice in a row | 14 original phase-1 journeys + 20 baseline regressions + 28 security/privacy/evidence tests (14 specs × 2 viewport projects) |
| Repeatability | ✅ | Original 14 alone; serial with 1 worker in reversed file order (62); each project alone (31 each); whole suite repeated ×3 (186 runs): all pass on the final build |

**Environment of record:** macOS 27.2 arm64, Node 20.20.0, npm 11.12.0, Next 15.5.29, React 19.3.1, Playwright 1.65.1 with **Chromium build 1255** (Chrome for Testing 159) at 1440×900 and 1024×768.

**Not verified:** Firefox and WebKit, Linux or CI runners, viewports below 800px (not designed), assistive-technology testing, a real Supabase instance (PostgREST, GoTrue, JWT verification, schema exposure; DB tests use PGlite, §9), concurrency/load on the database, `next dev` behaviour (no dev server was running or started).

### Phase 2B.1 test inventory

| File | Covers |
|---|---|
| `unit/policy.test.ts` | the permission matrix (role × permission × resource), `assertAllowed`, role-scoped assistant contexts |
| `unit/authz.test.ts` | strict session (no hidden default), every query authorizes the viewer, the scoped data layer, redaction returns copies, `guardPage` |
| `unit/evidence.test.ts` | source vs verification, evidence-aware matching (verified first, independent stays valuable, deterministic in any input order, no score keys), owner mutation rules, repository rules |
| `unit/evidence-actions.test.ts` | no session → typed error, cross-role mutations, smuggled verification rejected, verified evidence locked |
| `unit/privacy.test.tsx` | interests private by default **in the serialized view model**, voluntary reversible sharing, preferences, exports, assistant answers across every suggestion |
| `unit/assistant.test.ts` | the real `POST /api/assistant` handler: 401/400/403/404, manipulated context/suggestion/subject, gateway defense in depth, responsible behaviour, unverified evidence never stated as fact |
| `unit/talent-policy.test.ts` | 26 allowed and 35 declined representative requests (English and Spanish), determinism, documented limitation |
| `e2e/security-and-privacy.spec.ts` | HTTP-level authorization (HTML and RSC payloads), session issuance rules, private interests end to end, evidence indicators in search and passport, locked verified evidence, assistant behaviour |

**Mutation check (done once, by hand, on a scratch copy):** each of 12 protections was deliberately broken (engineer reads any passport, staff edits passports, staff reads private interests, the scoped layer leaks interests, preferences always visible, verified evidence removable, owner sets verification, ordering ignores verification, route skips the session, contexts not role-scoped, the policy never declines, the session defaults to staff). The unit suite failed for every one (1 to 13 failing tests each). It is not an automated step.

Existing assertions were preserved. Changes to existing tests were limited to what the design change forced: the explicit session (`persona = undefined` is no longer "staff"), the user-aware gateway signature, and `selfReported` → `verification`.

## 2. Commands and requirements

```bash
npx playwright install chromium   # once per Playwright version; downloads the exact Chromium build Playwright 1.65.1 expects (about 590 MB on disk: Chromium, headless shell, ffmpeg)
npm run check                     # typecheck + lint + unit tests + DB tests
npm run db:test                   # tests/db: migrations, RLS, grants, functions, seed (PGlite, ~262 tests)
npm run db:check                  # applies migrations + seed to a disposable PGlite and prints a structural summary
npm run db:seed:generate          # regenerates supabase/seed.sql from the TypeScript fixtures (deterministic)
npm run test:e2e                  # builds an isolated copy, then runs the suite (both viewport projects)
npx playwright test -g "Home"     # run a subset (needs a previous `npm run test:e2e` or `node scripts/e2e-build.mjs`)
```

- Verified on Node 20.20 (the repo does not yet declare `engines`).
- After upgrading `@playwright/test`, run `npx playwright install chromium` again; the browser build is tied to the Playwright version.
- Free ports are chosen by the OS. Nothing needs port 3000, and a running `next dev` is not disturbed.

## 3. Test isolation strategy

Problem (found in phase 2A): the app keeps its fictional data in server memory, and the E2E suite used a single server shared by both viewport projects. Tests that add skills or shortlist people leaked state into each other, so the second project and every re-run failed (11/14 on a first run, 8/14 on a second).

Solution: **one server process per test.**

- [tests/e2e/fixtures.ts](../../tests/e2e/fixtures.ts) starts a fresh `next start` for each test on a free port bound to `127.0.0.1`, overrides `baseURL`, and stops it afterwards. Each test therefore begins with the pristine dataset by construction. Order, worker count, viewport project and earlier runs cannot matter. No reset endpoint exists or is needed.
- Specs import `test` and `expect` from `./fixtures`, **never** from `@playwright/test`.
- `playwright.config.ts` has no `webServer` and no fixed `baseURL`, so a test can never attach to the developer's server.

## 4. Isolated build (why the dev server is safe)

`npm run test:e2e` first runs [scripts/e2e-build.mjs](../../scripts/e2e-build.mjs) (npm `pretest:e2e` hook). It copies `src/`, `public/` and the config files to a **workspace outside the repository**, symlinks `node_modules`, and runs `next build` there.

- Workspace path: `<os tmpdir>/sparq-e2e-<hash of the repo path>`, printed at the start of the build. Override with `E2E_WORKSPACE=/some/dir`.
- The repo's `.next`, `tsconfig.json` and `next-env.d.ts` are never written. (An earlier attempt using `distDir` did rewrite `tsconfig.json` and repoint `next-env.d.ts`, which is why a separate workspace is used instead.) This was verified by comparing `.next` (147 files, mtime and size) and the config checksums before and after the runs.
- The `.next` cache inside the workspace is kept between runs, so rebuilds take a few seconds.
- If the build is missing, the fixture fails with an explicit message instead of testing something stale.

## 5. Writing new E2E tests

- Use the fixtures. Mutating tests need no cleanup because the server is discarded.
- Wait for visibility before interacting with streamed content. Next streams page content inside Suspense boundaries, so right after `page.goto()` an element can still be in a hidden container. A hidden input cannot take focus (this caused a real flake while writing the focus tests).
- Make bounds checks **two-sided** (`Math.abs(x) < 2`), not `x < 2`.
- Do not use `.first()` or looser matchers to hide duplicate records; a duplicate is a bug.
- The `use` callback of a Playwright fixture is named `provide` in `fixtures.ts` because the `react-hooks` lint rule mistakes `use(...)` for a hook.

## 6. Responsive behaviour (details in `02-design-system.md` §11)

Verified at 1440, 1280, 1024 and 800px: no horizontal page overflow on Home, People (plain and with preview), Passport, Opportunities and the Opportunity drawer.

- Navigation labels hide **below** 1180px (`max-xl` is strict): visible at 1180, icons-only at 1179.
- The People preview aside is hidden below 960px (visible at 960, hidden at 959), replaced by an "Open … passport" button.
- Home team cards: the seat label sits beside the seats and shrinks first. When even its narrowest form cannot fit (only the Vela Bank card, measured at roughly 1015–1125px viewports, sampled every 5px) it moves below the seats so the arrow button always stays inside the card.

## 7. Defects corrected in phase 2A.1

| Defect | Fix |
|---|---|
| E2E suite not repeatable; the 1024 project failed alongside 1440 | Per-test server fixture (§3) |
| `playwright.config.ts` could attach to the dev server on :3000 and its `build` step overwrote `.next` | No `webServer`, isolated workspace build (§4) |
| Home opportunity-card arrow overflowed its card at ~1000–1130px | Seats group wraps, label shrinks first, arrow `flex-none` ([page.tsx](../../src/app/(staff)/page.tsx)) |
| No visible focus on text inputs (`outline-none`) | `.focus-ring-within` utility on the pill containers (People search, Home ask, Ask panel); edit-drawer fields use the global ring |
| "Add to compare" briefly enabled before hydration | `useHydrated()` in [ui-store.ts](../../src/lib/ui-store.ts); disabled in server HTML and until hydrated |
| Printed profile offset on the page | Print stylesheet flattens the export dialog; resets Tailwind v4's `--tw-translate-*` variables |
| Nav breakpoint documented as ≤1180 but implemented as <1180 | Documentation corrected; behaviour unchanged |
| Passport server actions threw on unauthorised calls, shortlist returned typed errors | Typed `ForbiddenError`; every passport and shortlist action returns `{ ok: false, error }`; role checks and Zod validation unchanged |

**Print gotcha worth remembering:** `translate: none` is rewritten away by the CSS minifier; reset `--tw-translate-x/y` instead. A first version of the print fix and its test were both wrong in the same way (a one-sided `y < 2` assertion passed while the document was shifted off the page).

## 8b. Accelerated MVP additions (2026-11-25)
Unit 610, DB 318 (`npm run db:test`), e2e 112 over both viewports (including `demo-journey.spec.ts`). `npm run test:remote` (61 tests against a real Supabase project with real tokens) skips without credentials and **has not been run**. A full `npm run check` under heavy machine load once hung and failed one DB runner test; it passed alone and on a quiet machine, so treat it as load flakiness, not a rule change. Persona redirects land on `localhost` while the test server is on 127.0.0.1: specs navigate again after switching persona.

## 9. Database tests (phase 2B.2)

`vitest.db.config.ts` runs `tests/db/**` in Node (separate from the jsdom unit suite). `tests/db/bootstrap.sql` emulates Supabase in PGlite: roles `anon`, `authenticated`, `service_role` (bypassrls), an `auth` schema with `auth.uid()` reading `request.jwt.claim.sub`, and Supabase's default privileges (so a forgotten REVOKE is caught). `tests/db/harness.ts` gives each test its own transaction, rolled back afterwards, with `as(user, fn)` to switch to a real role and JWT subject, and `attempt()` (savepoint) to assert that a statement fails.

Conventions: every denial test also asserts the legitimate path still works; defense-in-depth tests disable RLS or widen grants and show the triggers still block; catalog tests fail if a table lacks RLS, `anon` can reach anything, a function is executable by PUBLIC, `search_path` is not pinned, the RPC surface grows, or an authorization predicate can return NULL. When you change a rule, change its test; never weaken it.

Lessons that became permanent tests: `if not <boolean>` does not fire when the value is NULL (all denial checks are written `… is not true`); an RLS policy that looks a row up by id in the same table cannot see a row inserted by the same statement (`INSERT … RETURNING`), so such policies are written on the row's own columns.

**Mutation check (done once, by hand, in a scratch copy; not automated):** 22 protections were weakened one at a time in the SQL (e.g. owner may set verification, RLS disabled on a table, reviewer may be the person, capacity check removed, private interests readable by staff, self role grant). The DB suite failed for all 22.

**What these tests do not show:** behaviour on real Supabase (PostgREST/GoTrue/JWT verification, exposed schemas), concurrency under load, or the app running on the schema (no adapter exists).

## 10. Remaining limitations and known issues

- **Soft 404 on unknown profiles.** `/people/<unknown>` renders the not-found page with **HTTP 200** (and `noindex`). Cause confirmed by experiment: `src/app/(staff)/people/loading.tsx` creates a Suspense boundary, so Next streams the shell, and the status line, before `notFound()` runs. A scratch build without that file returned 404. This is standard Next streaming behaviour, not a bug in the page; changing it means changing the routing or loading structure, so it was left as is.
- Findings from the phase 2A audit that are **not** addressed here and belong to later phases: unauthenticated `/api/assistant`, self-reported evidence ranking like confirmed evidence, career interests visible to staff versus "private" in the docs, Ask Sparq not refusing "best/rank" questions, RLS gaps in the SQL draft, persistence and authentication.
- E2E coverage is the phase-1 journeys, the baseline regressions and the 2B.1 security/privacy tests. Not covered: compare-tray journeys, editing a summary or adding experience beyond the unit tests, error states, anything about RLS (tested in `tests/db`, not through the app, which has no database adapter yet).
- Each E2E test starts a server (~0.4 s). The suite runs in about 8 s on 6 workers; it will grow with the test count.
- Running `npm run build` in the repo overwrites `.next`; stop `npm run dev` first. The E2E suite does not do this.
- Screenshots in `screenshots/phase1-build/` were regenerated on 2026-11-24 (again in phase 2B.1) from this build (plain browser captures at 1440×900, downscaled to 800px). They are not produced by a script.
