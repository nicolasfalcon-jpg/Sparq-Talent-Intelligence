# 07 · Testing, environments and verification status

Last verified: **2026-11-24** (phase 2A.1). Everything in the "verified" column below was executed in that session; anything not listed was not run.

## 1. Verification status

| Check | Result | Notes |
|---|---|---|
| `npm run typecheck` | ✅ pass | `tsc --noEmit`, strict |
| `npm run lint` | ✅ pass | ESLint 9, no errors or warnings |
| `npm run test` (Vitest) | ✅ 55 / 55 | 5 files. The original 38 plus 17 new (server-action contract, compare hydration) |
| Production build | ✅ pass | Built by `npm run test:e2e` in the isolated workspace (§4). Same sources, config and lint/type gate as `npm run build`. |
| `npm run test:e2e` (Playwright) | ✅ 34 / 34, twice in a row | 14 original phase-1 journeys + 20 regression tests (10 specs × 2 viewport projects) |
| Repeatability | ✅ | Original 14 alone; serial with 1 worker in reversed file order; each project alone; whole suite repeated ×3 (102 runs): all pass on the final build |

**Environment of record:** macOS 27.2 arm64, Node 20.20.0, npm 11.12.0, Next 15.5.29, React 19.3.1, Playwright 1.65.1 with **Chromium build 1255** (Chrome for Testing 159) at 1440×900 and 1024×768.

**Not verified:** Firefox and WebKit, Linux or CI runners, viewports below 800px (not designed), assistive-technology testing, `npm run db:check` and any RLS behaviour (not run in this phase), `next dev` behaviour (no dev server was running or started).

## 2. Commands and requirements

```bash
npx playwright install chromium   # once per Playwright version; downloads the exact Chromium build Playwright 1.65.1 expects (about 590 MB on disk: Chromium, headless shell, ffmpeg)
npm run check                     # typecheck + lint + unit tests
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

## 8. Remaining limitations and known issues

- **Soft 404 on unknown profiles.** `/people/<unknown>` renders the not-found page with **HTTP 200** (and `noindex`). Cause confirmed by experiment: `src/app/(staff)/people/loading.tsx` creates a Suspense boundary, so Next streams the shell, and the status line, before `notFound()` runs. A scratch build without that file returned 404. This is standard Next streaming behaviour, not a bug in the page; changing it means changing the routing or loading structure, so it was left as is.
- Findings from the phase 2A audit that are **not** addressed here and belong to later phases: unauthenticated `/api/assistant`, self-reported evidence ranking like confirmed evidence, career interests visible to staff versus "private" in the docs, Ask Sparq not refusing "best/rank" questions, RLS gaps in the SQL draft, persistence and authentication.
- E2E coverage is the phase-1 journeys plus the regression tests above. Not covered: Ask Sparq panel flows beyond the Home card, compare-tray journeys, passport editing beyond adding a skill, error states.
- Each E2E test starts a server (~0.4 s). The suite runs in about 8 s on 6 workers; it will grow with the test count.
- Running `npm run build` in the repo overwrites `.next`; stop `npm run dev` first. The E2E suite does not do this.
- Screenshots in `screenshots/phase1-build/` were regenerated on 2026-11-24 from this build (plain browser captures at 1440×900, downscaled to 800px). They are not produced by a script.
