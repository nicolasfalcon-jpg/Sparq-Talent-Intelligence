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
| Supabase schema + RLS draft, validated in PGlite | ⚠️ superseded by phase 2B.2 (the 0001 draft is kept unchanged as history) |
| E2E specs | ✅ executed locally (phase 2A.1): 34 tests pass at 1440 and 1024, repeatably; each test runs on its own server. See [07-testing.md](07-testing.md) |

## Phase 2B.1 — Application security & domain integrity ✅ (in memory, no database)

| Item | Status |
|---|---|
| One authorization policy, enforced in the scoped data layer, queries, actions and the assistant (not only layouts) | ✅ |
| Strict demo session (no hidden default role); assistant API requires a session and authorizes context, suggestion and subject | ✅ |
| User-aware `AssistantGateway` contract (provider-ready, no provider connected) | ✅ |
| Evidence **source** and **verification** as separate concepts; owners cannot verify, and cannot remove verified evidence | ✅ |
| Evidence-aware, deterministic discovery with visible evidence basis (no scores) | ✅ |
| Career interests private by default; voluntary, reversible sharing; enforced in data selection | ✅ |
| Responsible-use policy for Ask Sparq (no ranking, scoring, "weakest", trait inference, autonomous decisions) | ✅ |
| Database/RLS changes required to mirror all of the above | ✅ designed and verified in phase 2B.2 (below) |

## Phase 2B.2 — Database security & schema ✅ (designed and tested in PGlite; not connected, not applied anywhere)

| Item | Status |
|---|---|
| Additive migrations `0002`–`0009`; `0001` preserved byte-for-byte; legacy tables archived in locked `legacy_0001` | ✅ |
| 4 roles in `user_roles` (not JWT), uuid ids + slugs, identity ↔ profile link, no self-escalation, admin without business powers | ✅ |
| Evidence source vs verification, reviewer-only verify/revoke, append-only audit, hardened `SECURITY DEFINER` functions | ✅ |
| Row **and** column privacy (private interests, withdrawable preferences, separate expression of interest) | ✅ |
| Staffing domain: proposal lifecycle, separate human approval and assignment confirmation, fractional/overlapping allocations, derived availability | ✅ |
| RLS on all 20 tables (incl. the 7 that had none); least-privilege grants, anon and authenticated reviewed separately | ✅ |
| Deterministic fictional seed (generated from fixtures) | ✅ |
| 262 DB tests under real role switching (PGlite, emulated Supabase roles) | ✅ **not** a real Supabase instance: see [08](08-authorization-and-evidence.md) §9 |
| Application adapter, real auth, real Supabase verification | ❌ phase 2C |

## Phase 2C — Supabase adapter and identity (not started; needs explicit authorization)

Prerequisites (details in [08](08-authorization-and-evidence.md) §10): approval to run the Supabase local stack and re-run the DB tests there; signup trigger with no roles and SSO → role mapping through admin functions; adapter mapping slug ↔ uuid, `level` → `source`, 4-role `UserRole`; product decisions (engineer opportunity visibility, end-date confirmation, correction requests); migration to drop `legacy_0001`.

## Phase 2 — Persistence, identity, core staffing flows

0. ~~Apply the schema/RLS changes of 08 §7~~ Done in 2B.2 (verified in PGlite only; re-verify on a real Supabase local stack first).
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
