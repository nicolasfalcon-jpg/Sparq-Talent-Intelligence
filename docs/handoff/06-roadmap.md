# 06 · Implementation status & roadmap

## Phase 1 — Engineering foundation ✅ (this repository)

| Item | Status |
|---|---|
| Next.js App Router project, strict TS, Tailwind v4, ESLint, Vitest, Playwright config | ✅ |
| Feature-based architecture (`domain` → `data` → `features` → `app`) | ✅ |
| Design tokens and primitives extracted from V4.2 | ✅ |
| App shell: header, nav (icons-only below 1180), New opportunity chooser, notifications, workspace switch | ✅ |
| Global Ask Sparq (FAB, drawer, wide, minimized; empty, loading, answer and error states) behind `/api/assistant` | ✅ (rule-based gateway) |
| Domain contracts (Zod) and pure rules, unit-tested | ✅ |
| Fictional dataset behind async repositories (in-memory adapter) | ✅ |
| **Home**: computed stats, teams in the making, ready for next team, Ask card | ✅ |
| **People**: plain-language search → criteria chips, discipline and availability filters in the URL, preview aside, shortlist, compare tray | ✅ |
| **Talent Passport** (staff): every person, evidence groups, need summaries, selected work, journey, certifications, interests, shortlist, compare, preview & export (PDF via print) | ✅ |
| **Personal Passport**: edit summary, add/remove skills, add experience, toggle interests (server actions, owner-only) | ✅ |
| **Opportunities**: status tabs, URL-addressable drawer, computed requirement summary | ✅ |
| Role-guarded workspaces (demo persona) | ✅ |
| Supabase schema + RLS draft, validated in PGlite | ✅ |
| E2E specs | ✅ executed locally (phase 2A.1): 34 tests pass at 1440 and 1024, repeatably; each test runs on its own server. See [07-testing.md](07-testing.md) |

## Phase 2 — Persistence, identity, core staffing flows

1. **Supabase adapter.** Implement `src/data/repositories/supabase.ts` with the same interfaces, then switch on `SPARQ_DATA_SOURCE=supabase`. Write a seed script that generates SQL from `src/data/fixtures` (fictional data only).
2. **Auth.** Use `@supabase/ssr` with company SSO and map claims to `app_role`. Replace `src/lib/session.ts` internals and delete `/persona`. Keep `requireRole` in every server action.
3. **Audit log** for shortlist changes, passport views and exports, proposals, and AI queries.
4. **Fill a Role** (`/opportunities/new/role`): describe → requirements (must-have / nice-to-have) → people (reuse `matchPeople`) → review → send. See the functional spec §8.
5. **Build a Team** (`/opportunities/new/team`): React Flow canvas (see design-system §14), seat drawer, coverage, availability conflicts, proposal review. Proposals write `team_proposals` and `proposal_seats`. Approval creates `assignments`.
6. **Talent Comparison** (`/compare?ids=&role=`): consumes the compare tray selection and the role context. Show relevant people only. Max 3. No ranking.
7. **Resource Planning** (`/planning`): timeline computed from assignments, plus "Ask the delivery lead to confirm" as a real notification.
8. **My Space** (`/me`): Now / Next, matching opportunities (skills ∩ interests), express interest, "Update from my CV" (see import below).
9. Run the Playwright suite in CI at 1440 and 1024 (it runs locally today; the CI runner, `npx playwright install --with-deps`, and a Linux run are not set up or verified). Add visual-regression baselines against `docs/handoff/screenshots/v4.2-approved`.

## Phase 3 — Intelligence

1. **Ask Sparq LLM gateway** (`LlmAssistant implements AssistantGateway`):
   - Server-only. The provider key lives in a secret store.
   - Retrieval over documented evidence, projects and opportunities, filtered by the caller's RLS scope.
   - Answers must cite refs (person, evidence). The UI already renders refs and provenance.
   - Guardrails: no performance judgments, no ranking, no protected attributes; refuse questions about individuals' personal lives.
   - Keep the rule-based answers as deterministic fallbacks and for evals.
2. **Plain-language search parser:** an LLM proposes catalogue capability ids, and the UI shows them as editable "I looked for" chips (the current contract).
3. **CV import:** upload → server-side parsing → *suggested* evidence the owner approves item by item. Nothing auto-publishes.
4. **Skills Intelligence** (`/insights`): aggregated supply and demand by capability, with a minimum group size to avoid identifying individuals.
5. **Exports:** server-side PDF/DOCX generation, owner notification on every share, an audit entry.

## Upgrade notes
- Next 15 → 16: follow the official codemods. Async `params` and `searchParams` are already used throughout.
- If you add a component library, wrap it in `src/design-system` and restyle it with tokens. Don't use default themes.

## Definition of done for every new module
- Matches the V4.2 screen at 1440 and 1024 (compare against `design-reference` and the screenshots).
- Reads through repositories, writes through role-checked server actions with Zod input.
- Empty, loading and error states implemented.
- Unit tests for new rules, plus an E2E happy path.
- No numeric score about a person appears anywhere.
