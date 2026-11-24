# 05 · Prototype-to-production gap analysis — Sparq Talent Intelligence (V4.2)

| | |
|---|---|
| **Source** | `design-reference/v4.2/screens/*.dc.html` and `wrappers/*.dc.html` (`v3-portrait` is shipped as `screens/portrait.dc.html`), `canvas-v4.2.json` |
| **Target stack** | Next.js (App Router, server components + server actions) · Supabase (Postgres, Auth, RLS, Storage, Edge Functions/queues) · LLM provider behind a server-side gateway |
| **Companion doc** | `03-functional-spec.md` |

Everything in the "Expected production behavior" and "Suggested implementation" columns is **Proposed** unless stated otherwise.

> **Phase-1 build status (this repository).** These gaps are already closed in code:
> - Home figures are computed from data, not a snapshot.
> - Every person has a passport, not just Ana.
> - Search interprets any catalogue capability, not only React Native and iOS.
> - Shortlist and passport edits go through role-checked, Zod-validated server actions and repositories instead of `localStorage`.
> - Drawers, filters and selection are real URL state.
> - Fake `setTimeout` loading was removed. Loading states now reflect real requests.
> - Ask Sparq answers carry provenance, and several are computed from data.
> - PDF export works through the browser's print dialog.
>
> Still open from this document:
> - Persistence: in-memory, not Supabase.
> - Auth: demo persona cookie.
> - LLM.
> - Server-side DOCX/PDF generation and owner notifications.
> - Audit log.
> - Every module that is still a placeholder.
>
> See `06-roadmap.md`.

## 1. Gap categories

| Code | Category | Meaning |
|---|---|---|
| **ST** | Static | Hard-coded data or copy in `renderVals()`; never changes. |
| **SIM** | Simulated | Fake latency via `setTimeout`, keyword routing, canned extraction. |
| **LS** | Stored locally in browser | Persisted in `localStorage` under `sti42.*`; per-browser, unauthenticated, cleared by the Showcase cover. |
| **PR** | Predefined responses | Fixed AI answers/summaries per context. |
| **PI** | Partially implemented | UI exists but the effect is missing or limited. |
| **NAV** | Prototype-specific navigation | Wrappers, `self`/`stage`/`mode`/`aiState` props, showcase tour, canvas "Play". |

**Priorities.** **P0** = required for a first internal pilot (real data, auth, privacy, human-in-the-loop). **P1** = required for general availability. **P2** = later / nice to have.

## 2. Gap table

### 2.1 Data & identity

| # | Capability | Cat. | Current behavior (file) | Expected production behavior | Suggested implementation | Pri. |
|---|---|---|---|---|---|---|
| D1 | People directory (12 people) | ST | Arrays duplicated and slightly divergent in `v4-people`, `v4-role`, `v4-team`, `v4-compare` (`Component.DATA`), `v4-planning`, `v4-insights`, `v4-home` | Single source of truth for people, skills, evidence, availability | Tables `people`, `skills` (taxonomy), `person_skills(person_id, skill_id, level enum[professional, independent, training, emerging], evidence_text, source enum[project, self, cv, course], confirmed_by, confirmed_at)`; seed script with the fictional data for demo tenant | P0 |
| D2 | Full passport | PI | Only Ana Ruiz has one (`v4-passport` hard-codes Ana; `v4-people` shows "Full passport in this prototype: Ana Ruiz") | Every person has a passport at `/people/[id]` | Tables `passports(person_id, summary, location, years, languages, travel_pref, team_size_pref, updated_at)`, `experiences(id, person_id, client_id, title, role, summary, period, tags[], status enum[self_reported, awaiting_confirmation, confirmed], confirmed_by)`, `experience_evidence`, `certifications`, `career_journey` | P0 |
| D3 | Personas & auth | NAV | `mode` prop + avatar menu "Staffing" / "My space" switch (`v4-nav`); Laura and Ana hard-coded | Supabase Auth (SSO); role-based access: `engineer`, `staffing_lead`, `delivery_lead`, `admin`; persona switch only for users with both roles | `profiles(user_id, person_id, roles[])`; middleware redirects `/` → `/me` for engineers; RLS on every table | P0 |
| D4 | "Today" date | ST | Fixed Nov 24, 2026; day offsets from Nov 1 (`T = 23`, `KICK = 72`) in `v4-planning`, `v4-team`, `v4-role` | Real dates, user timezone | `date` columns; date-fns; server-computed "available now" | P0 |
| D5 | Portraits | ST | Illustrated SVGs for 13 fictional people (`v3-portrait`) | Uploaded photo or initials fallback | Supabase Storage bucket `avatars` (private, signed URLs); `<Avatar>` component; keep illustrations for demo tenant | P2 |
| D6 | Fictional-data guarantee | ST | Copy on cover, export footer, Ask Sparq footers | Demo tenant isolated from production; production data never mixed into demo | Separate Supabase project or `tenant_id` + RLS; seed/reset job for demo | P1 |

### 2.2 Session state (`sti42.*`)

| # | Key / capability | Cat. | Current behavior (file) | Expected production behavior | Suggested implementation | Pri. |
|---|---|---|---|---|---|---|
| S1 | `sti42.passport` (summary, added experience) | LS | Written/read by `v4-passport`; `extra` read by `v4-me` "Recently added" | Persisted to the person's passport, visible to staff after save, audit-logged | Server action `updatePassport()`; tables from D2; `audit_log` entry | P0 |
| S2 | `sti42.ints` (interests) | LS | Shared between `v4-passport` Interests tab and `v4-me` "What I’m looking for" | Owner-editable; visible to staffing leads; used only for opportunity suggestions | `person_interests(person_id, interest_id, active)`; RLS: owner write, staff read | P0 |
| S3 | `sti42.skillsAdded` | LS | `v4-passport` (with level) and `v4-me` (always `p`) append; base-skill removals not persisted | Add/remove skills with level + source; searchable after save | `person_skills` with `source='self'`; reindex search on change (trigger) | P0 |
| S4 | `sti42.shortlist` | LS | Written by `v4-people`, `v4-passport` (Ana only), `v4-compare`; badges in `v4-role`, `v4-team` | Per-lead shortlist across devices; optionally per opportunity | `shortlists(id, owner_id, opportunity_id null)`, `shortlist_items(shortlist_id, person_id, added_at)`; RLS owner-only | P1 |
| S5 | `sti42.me` (interested, curious, gql, outcome, bonus, plan) | LS | Only `v4-me` reads it; other screens never see Ana's interest (Fill a role "Shared interest" badge hard-coded `interested:true`) | Interests reach staffing lead + delivery lead; withdrawals propagate | `opportunity_interests(person_id, opportunity_role_id, note, status enum[shared, withdrawn], created_at)`; `growth_interests`; `learning_plan_items`; notifications on insert | P0 |
| S6 | `sti42.team` | LS | `v4-team` draft (roles, sent, saved, stage); listed in `v4-opportunities` drafts | Team drafts per user, multi-device; proposals visible to reviewer | `opportunities(status draft…)`, `seats(id, opportunity_id, title, kind, caps[], level, allocation, person_id, state enum[open, proposed, confirmed])`, `proposals` (see W-rows) | P0 |
| S7 | `sti42.role` | LS | `v4-role` draft; stage stored as max, so a sent role re-opens "sent" forever | Role drafts with explicit status lifecycle | `requirements(id, role_id, skill_id, priority enum[must, nice], source_span)`; `proposals` | P0 |
| S8 | `sti42.compare` | LS | Payload set on "Compare" click by `v4-people`, `v4-passport`, `v4-role`, `v4-team` | Stateless, shareable URL | `/compare?ids=a,b,c&role=[roleId]&from=[path]`; validate ≤3 ids server-side | P1 |
| S9 | Reset demo | LS / NAV | Cover "Start the guided demo →" deletes all `sti42.*` (`v4-show-cover`) | Demo tenant reset | Admin-only server action / scheduled job reseeding demo tenant | P2 |
| S10 | Non-persisted UI state | PI | Compare tray, Planning "Ask … to confirm", notification read state, "Open to new opportunities", share-interest note, reviewer note — lost on navigation | Persist where it has business meaning | `notifications.read_at`; `people.open_to_opportunities`; note columns on `opportunity_interests` and `proposals`; tray in URL/state only | P1 |

### 2.3 Workflows (role, team, review)

| # | Capability | Cat. | Current behavior (file) | Expected production behavior | Suggested implementation | Pri. |
|---|---|---|---|---|---|---|
| W1 | Requirement extraction from brief | SIM / PR | "Draft the requirements" waits 1 s and shows canned Vela Bank requirements regardless of text (`v4-role`) | Extract capabilities, seniority, allocation, dates from free text, each linked to its source span; clarifying questions | Server action → LLM gateway with structured output (JSON schema) mapped to skills taxonomy; store `source_span`; user edits before save | P0 |
| W2 | Team composition from brief | SIM / PR | "Compose the team" waits 1.1 s; always 4 Kestrel Travel seats (`v4-team`) | Proposed seats from brief + (optionally) similar past teams | LLM structured output + retrieval over past opportunities; user edits seats; "Add a role" templates from a `role_templates` table | P1 |
| W3 | Candidate discovery per role/seat | ST / SIM | Fixed pools (5 people in `v4-role`; `POOL` by kind in `v4-team`); ordering via hidden weighted sum (professional 1, training 0.4, must ×2) | All visible people evaluated on documented evidence; deterministic, explainable ordering; no score shown | SQL view/RPC `match_candidates(role_id)` returning per-requirement evidence levels + availability; ordering rule documented in UI ("Ordered by documented matches, then availability"); never return numeric score to client | P0 |
| W4 | Propose / replace / move | PI | Works in component state; one person per role/seat; "Move here" across seats (`v4-role`, `v4-team`) | Same rules enforced server-side; one active seat per person per opportunity | Server actions `proposePerson(seatId, personId)`, unique constraint `(opportunity_id, person_id)` on active seats | P0 |
| W5 | Confirmed seat state | PI | Only preset (Javier, iOS seat) in canvas fixtures; no UI to confirm (`v4-team`) | Only reviewer (delivery lead) can confirm a seat | `seats.state='confirmed'` settable only via `reviewProposal()` with RLS check `delivery_lead_id = auth.uid()` | P0 |
| W6 | Send for human review | PI | Sets `sent`/`st=3`, shows banner; reviewer (Rafael Ortiz / Inés Vidal) hard-coded; nothing delivered (`v4-role`, `v4-team`) | Proposal delivered to the opportunity's delivery lead; reviewer accepts/returns/declines per seat; people contacted only after acceptance | `proposals(id, opportunity_id, submitted_by, reviewer_id, status enum[draft, submitted, returned, accepted, declined, withdrawn], note)`, `proposal_items`; reviewer inbox page **(needs design)**; notifications; audit log | P0 |
| W7 | Reviewer note | PI | Textarea not bound (`v4-team` proposal modal) | Note stored with the proposal and shown to the reviewer | `proposals.note` | P1 |
| W8 | Coverage check | PI | Computed client-side over hard-coded skills (`v4-team`) | Same rules (see spec §9.6) over real evidence | Pure TS function shared by client & server, unit-tested; data from W3 RPC | P0 |
| W9 | Availability conflict detection | PI | Client-side `fit()`; "proposed elsewhere" is a hard-coded `conflict` string for Lucía/Camila (`v4-team`, `v4-role`) | Conflicts computed from assignments, pending confirmations and other open proposals | `assignments(person_id, opportunity_id, start, end, end_confirmed bool, delivery_lead_id)`; RPC `availability_conflicts(opportunity_id)` | P0 |
| W10 | Opportunity records & deep links | ST / NAV | 4 static opportunities; "Fill this role" always opens Vela Bank mobile; "Build the team" always Kestrel (`v4-opportunities`) | CRUD for opportunities; deep links carry ids | `opportunities`, `opportunity_roles`, `clients`; routes `/opportunities/[id]`, `/opportunities/new/role?opportunity=&role=` | P0 |
| W11 | Drafts list | LS | "Your drafts in this session" from `sti42.team` / `sti42.role` (`v4-opportunities`) | "Your drafts" from DB, per user | Query `opportunities where status='draft' and created_by = auth.uid()` | P1 |
| W12 | Post-send editing | PI | Role candidates stay interactive after sent; team change clears `sent` silently | Explicit lifecycle: withdraw → edit → resubmit; reviewer sees version history | `proposals.version`; UI "Withdraw proposal" (needs design) | P1 |
| W13 | Request availability confirmation | PI | "Ask {lead} to confirm" only flips the label (`v4-planning`) | Creates a task/notification for the delivery lead; status visible | `confirmation_requests(person_id, assignment_id, requested_by, requested_at, resolved_at)`; notification; email (optional) | P1 |
| W14 | Express interest | PI | Stored in `sti42.me`; note not stored; not visible to staff (`v4-me`) | Delivered to staffing lead + delivery lead; badge in Fill a role/Opportunities; withdraw propagates | S5 tables; notification to lead; RLS limiting visibility to lead + delivery lead + owner | P0 |

### 2.4 Search, compare, planning, insights

| # | Capability | Cat. | Current behavior (file) | Expected production behavior | Suggested implementation | Pri. |
|---|---|---|---|---|---|---|
| Q1 | Natural-language people search | SIM / PI | Input text ignored; always applies React Native + Native iOS criteria; 800 ms delay (`v4-people`) | Parse any query into capability/availability criteria shown as removable chips | LLM structured extraction → skills taxonomy (+ synonyms table); Postgres query over `person_skills`; optional `pgvector` for fuzzy skill matching; fallback to keyword filter if LLM unavailable | P0 |
| Q2 | Filters & ordering | ST | Discipline + "Available by January" (≤ Jan 31) hard-coded | Discipline from taxonomy; availability window selectable (Proposed) | Query params; indexed columns | P1 |
| Q3 | Compare relevance & limit | PI | Relevance filtering, alias LLM apps ≡ LLM integration, max 3 (`v4-compare`); 4th add silently ignored in `v4-people` | Same rules; explicit max-3 message; aliases from taxonomy | Taxonomy `skill_aliases`; server validation | P1 |
| Q4 | Compare "Must-haves" label | PI | Shows all role caps incl. nice-to-haves (`v4-compare`) | Separate must-have / nice-to-have sections | Pass priority with role ref | P2 |
| Q5 | Planning timeline | ST | 12 static rows; proposals in session not shown ("Illustrative snapshot…" chip) (`v4-planning`) | Live assignments, availability, submitted proposals overlay | RPC `planning_timeline(from, to, discipline)`; realtime refresh optional | P1 |
| Q6 | Date inconsistencies | ST | Day-offset labels: Tomás/Nimbus "Mar 1" in Planning vs "Mar 2" elsewhere | Correct dates | Real `date` columns | P0 (fixed by D4) |
| Q7 | Insights aggregates | ST | Counts, gaps and observations hard-coded (`v4-insights`) | Computed from passports + open roles | Materialized view refreshed nightly (pg_cron) `capability_supply_demand`; observation rules as SQL; k-anonymity threshold for small groups | P1 |
| Q8 | Home snapshot | ST | Stats, teams, people static; chip "Illustrative organizational snapshot · not updated by this session" (`v4-home`) | Live data | Server components querying views; remove chip | P1 |

### 2.5 Ask Sparq & AI

| # | Capability | Cat. | Current behavior (file) | Expected production behavior | Suggested implementation | Pri. |
|---|---|---|---|---|---|---|
| A1 | Assistant panel Q&A | PR / SIM | 2 predefined Q&A per context tagged "Illustrative example"; free text matched on words > 4 letters, else fallback "In this prototype I answer a few example questions…"; 900 ms delay (`v4-nav`) | Real answers grounded in permitted data with citations | Route handler `/api/assistant` → **server-side LLM gateway** (provider keys never on client); retrieval over documented evidence (passports, experiences, opportunities, assignments) filtered by RLS for the current user; tool calls for structured queries; responses include `citations[]` (record ids → links); streaming | P0 |
| A2 | "Live from this page" items | SIM | Computed client-side from page state (Fill a role, Build a team, My space) via `liveQ`/`liveItems` props | Same, but from server state; tag kept | Page passes context ids; gateway fetches state; deterministic templates where possible (no LLM needed) | P1 |
| A3 | Home card routing | SIM / PR | Regex routing to 4 canned answers (`v4-home`) | Same LLM gateway with `context=home` | Reuse A1 | P1 |
| A4 | Passport summaries | PR | Two predefined summaries ("For a mobile lead role", "For an AI product") (`v4-passport`) | Generated per need, citing projects; states undocumented gaps | A1 with prompt template + required citations; cache per (person, need, passport version) | P1 |
| A5 | Opportunity summary | SIM | Computed lines after 800 ms (`v4-opportunities`) | Deterministic summary from record (no LLM needed) | Server function; optional LLM rewrite | P2 |
| A6 | Guardrails | ST (copy) | Copy only: "never a score", "never individual performance" | Enforced: refuse ranking/scoring/performance; engineer mode limited to own data; PII minimization in prompts | System prompts + policy classifier in gateway; allow-listed retrieval sources; red-team test suite | P0 |
| A7 | Conversation logging | — (absent) | Nothing stored | Log prompts/answers/citations for audit & quality, with retention policy | `assistant_messages(user_id, context, question, answer, citations jsonb, model, created_at)`; retention job (e.g. 90 days) | P1 |
| A8 | Loading/error states | SIM / absent | Spinners via `setTimeout`; no error state | Streaming, timeout, retry, rate limit | Gateway timeouts (20 s), per-user rate limit; UI states (needs design) | P1 |

### 2.6 Import & export

| # | Capability | Cat. | Current behavior (file) | Expected production behavior | Suggested implementation | Pri. |
|---|---|---|---|---|---|---|
| X1 | Passport export (PDF / Word / One-page) | PI | Format choice, anonymize toggle, "Preparing your document…" 1 s, then "No file is created in this prototype." Preview identical for all formats (`v4-passport`) | Real file per format, matching preview; anonymization server-side | Background job (Supabase Edge Function / queue): PDF via headless Chromium or `@react-pdf/renderer`; DOCX via `docx` library; store in private bucket; signed URL (short TTL) | P1 |
| X2 | "Copy internal link" | PI | Only toggles label | Copies an authenticated internal URL | `navigator.clipboard`; `/people/[id]?view=shared` requiring auth | P1 |
| X3 | Owner notified on share/export | PI | Copy says "Ana is notified whenever her passport is shared." — nothing sent | Notification + audit entry on every export/share | `notifications`, `audit_log(action='passport.export', actor, subject_person, format, anonymized)` | P0 |
| X4 | Staff export consent | — (absent) | Staff can press Export in "Preview profile" with no consent check | Policy decision: staff exports allowed only for internal use / with owner consent setting | `passports.share_consent`; RLS/action check | P0 |
| X5 | CV import ("Update from my CV") | SIM / PI | No upload (sample button "Use Ana_Ruiz_CV_2026.pdf"), canned 4 suggestions, applying only raises completeness % (`v4-me`) | Upload PDF/DOCX, extract diff vs passport, keep/skip per item, apply atomically | Private bucket `cvs`; background parse job (text extraction + LLM structured diff); `cv_imports(id, person_id, file_path, status, suggestions jsonb)`; apply via server action writing `person_skills`/`experiences` with `source='cv'`; delete file after N days | P1 |
| X6 | Bulk / HRIS import | — (absent) | Not present in V4.2 | Out of scope of the prototype — **not designed** | If needed: admin CSV/HRIS sync job; requires design and data-protection review | P2 |

### 2.7 Notifications, completeness, misc.

| # | Capability | Cat. | Current behavior (file) | Expected production behavior | Suggested implementation | Pri. |
|---|---|---|---|---|---|---|
| N1 | Notifications | ST | 3 staff / 1 personal static items; "Mark read" is session-only (`v4-nav`) | Real events (interest shared, passport updated, proposal reviewed, confirmation requested, passport viewed/exported) | `notifications(id, user_id, type, payload, read_at)`; Supabase Realtime; triggers from domain actions | P1 |
| N2 | "Laura viewed your passport" | ST | Static personal notification | Optional view notifications (policy decision) | `passport_views` log; notify per owner preference | P2 |
| N3 | Passport completeness | PI | Static "86% complete" on passport; formula in `v4-me` | Single server-computed value with documented rubric | SQL function `passport_completeness(person_id)` | P2 |
| N4 | Goals, learning plan, growth areas | ST / PI | Goals static; plan and "I’m curious" in `sti42.me` (`v4-me`) | Owner-managed; curiosity shared with staffing | `goals`, `learning_items` catalogue, `learning_plan_items`, `growth_interests` | P2 |
| N5 | "Open to new opportunities" | PI | Checkbox not persisted, no effect (`v4-me`) | Controls visibility in suggestions / interest prompts | `people.open_to_opportunities` | P1 |
| N6 | Experience confirmation by delivery lead | PI | Self-added experience shows "awaiting confirmation by a delivery lead"; no confirm flow | Delivery lead confirms/declines | `experiences.status`, confirm action, notification (needs design) | P1 |
| N7 | Edit drawer Cancel semantics | PI | Skills/interests changes persist even on Cancel (`v4-passport`) | Draft discarded on Cancel; atomic save | Form state + single `updatePassport` action | P0 |
| N8 | Responsive/mobile | PI | Header collapses below 1180 px; layouts fixed for 1440 px boards | Responsive down to tablet; mobile read-only (Proposed) | Tailwind breakpoints; needs design for < 768 px | P2 |
| N9 | Accessibility | PI | Good semantics (`role="dialog"`, `aria-pressed`, `aria-current`, focus outlines) but no focus trap/Esc handling | WCAG 2.2 AA | Radix/shadcn dialogs, focus management, axe tests | P1 |

### 2.8 Prototype-specific navigation (do not port as-is)

| # | Mechanism | Current behavior (file) | Production replacement | Pri. |
|---|---|---|---|---|
| V1 | Stage wrappers | `v4-role-review/-people/-sent`, `v4-team-canvas/-position/-proposal` embed a screen with `stage` (and `self`) props | Stage = server state of the draft; fixtures become Storybook stories / Playwright seeds | P1 |
| V2 | Ask Sparq state wrappers | `v4-ai-empty/-loading/-response/-wide/-min` set `aiState` | Storybook stories for the panel | P2 |
| V3 | `mode` / `self` props | `v4-mypassport` embeds `v4-passport` with `mode="personal"`; `self` sets back-link targets for Compare | Route-based: `/me/passport` vs `/people/[id]`; `from` query param | P0 |
| V4 | Showcase tour | `v4-tour` fixed bar (step 1–9, "/10" label), `v4-show-*` wrappers, cover & journey pages | Optional demo-tenant feature flag (`/showcase`); otherwise omit | P2 |
| V5 | "Play" | Canvas notes say "press Play (▷)" — this is the Claude Design canvas viewer's run mode (`canvas.json` `launch` = `v4-show-cover`). **No hash-based routing or `location.hash` code exists in the V4 files.** | Not applicable; Next.js routing | — |
| V6 | Persona switch in avatar menu | "Staffing" / "My space" links switch freely | Role-gated switch | P0 |
| V7 | Inter-file links with `.dc.html` | `<a href="v4-x.dc.html">` | Next.js `<Link>` to routes in spec §0.5 | P0 |

## 3. Proposed production architecture (summary)

- **Data:** Postgres schema per tables above; `skills` taxonomy with aliases; all evidence rows carry `level`, `source`, `confirmed_by`. Views/RPCs for matching, conflicts, coverage inputs, planning, insights.
- **Security:** Supabase Auth (SSO); RLS on all tables. Engineers: read/write own passport, interests, CV imports; read open opportunities. Staffing leads: read passports of people in scope, write drafts/proposals/shortlists. Delivery leads: review proposals for their opportunities, confirm availability/experience. Admin: taxonomy, demo reset.
- **Server actions:** `updatePassport`, `addExperience`, `shareInterest`/`withdrawInterest`, `saveDraft`, `proposePerson`, `submitProposal`, `reviewProposal`, `requestConfirmation`, `exportPassport`, `applyCvImport`.
- **AI:** single server-side gateway (route handler or Edge Function) — provider-agnostic; prompt templates per context; retrieval restricted to rows the user can read; mandatory citations; structured outputs for extraction (requirements, team composition, CV diff, search criteria); policy layer refusing scoring/ranking/performance; logging with retention.
- **Background jobs:** CV parsing, export generation, nightly insights materialization, notification fan-out, demo reset.
- **Audit log:** `audit_log(id, actor_id, action, subject_type, subject_id, payload jsonb, created_at)` for passport edits, shares/exports, proposals (submit/review), confirmations, interest share/withdraw, AI queries touching personal data.

## 4. Known limitations of V4.2

1. Only **Ana Ruiz** has a full passport; other people exist only as preview/compare/planning rows.
2. People search **ignores the typed text**; it only understands React Native + Native iOS.
3. Requirement extraction (Fill a role) and team composition (Build a team) are **canned**; the brief is never parsed.
4. All Ask Sparq answers are **predefined** or simple page-state templates; free-text matching is keyword-based with a fallback message.
5. **Export creates no file**; all three formats share one preview; "Copy internal link" copies nothing; the owner is not actually notified.
6. **CV import has no upload**; suggestions are canned; applying only changes the completeness percentage.
7. Home and Planning are **static snapshots** (explicit chips); Insights and Opportunities are static too.
8. **Notifications are static**; "Mark read" is not persisted.
9. Confirmed seat state cannot be produced by any user action; **no reviewer experience** exists (Rafael Ortiz / Inés Vidal are names only).
10. "Note for the reviewer" and the share-interest note are **not stored**.
11. Shared interest from My space **does not reach** the staffing side; the "Shared interest" badge in Fill a role is hard-coded.
12. Passport edit drawer: skill/interest changes **persist on Cancel**; base-skill removals don't persist.
13. Session state lives in **localStorage** (per browser, no auth) and is wiped by the Showcase cover.
14. Candidate ordering uses a **hidden weighted sum**; acceptable only if it stays internal and is explained as "documented matches, then availability".
15. Evidence levels are **inconsistent** across screens (5 levels in Passport; 3 elsewhere; "Growing" in Insights).
16. Date handling is **day-offset based** with a fixed "today" (Nov 24, 2026) and one off-by-one (Mar 1 vs Mar 2).
17. Hard-coded routing: "Fill this role" → always Vela Bank mobile; "Build the team" → always Kestrel Travel; Compare from the passport → always Ana/Javier/Ethan.
18. Compare shows nice-to-haves under "Must-haves" and cannot be emptied.
19. No error states, no empty states for most lists, no loading states beyond `setTimeout` spinners.
20. No reviewer inbox, no admin, no taxonomy management, no bulk import, no mobile layouts.
21. Tour says "/10" but has 9 positions; tour bar position differs from the canvas note.

## 5. Risks & ethical guardrails

| Guardrail | Risk if ignored | Production requirement |
|---|---|---|
| **No scoring or ranking** | Talent tooling drifts into covert performance ranking; discrimination and works-council/legal exposure. | Never expose numeric match scores in UI, API responses or exports. Ordering rule is fixed, documented and explained in-product ("Ordered by documented matches, then availability"). Ask Sparq refuses "who is best/rank/score" questions and explains why. Code review checklist item; contract tests asserting no `score` fields leave the server. |
| **Human-in-the-loop** | Automatic assignment or contact before review. | Only reviewers can set `confirmed`; proposals never trigger contact to the engineer until `accepted`; UI copy "Proposing isn’t assigning" retained; audit every state change. |
| **Consent for sharing** | Passports/CVs exported or shared without the owner's knowledge. | Owner notified on every export/share; owner-level consent setting for staff exports; anonymization option; exports watermarked "Internal use only"; signed URLs with short TTL. |
| **Visibility rules** | Interests, curiosity areas, goals or CVs seen by the wrong people. | RLS: shared interests visible only to owner, staffing lead and the opportunity's delivery lead (as the prototype promises: "Only Laura Gómez and the delivery lead will see this."); goals/learning plan owner-only; CV files owner-only and deleted after processing window; Insights shows aggregates with a minimum group size. |
| **Data minimization** | Over-collection, sensitive data in prompts. | Store only work-relevant evidence; no performance ratings, compensation, health or demographic data in the product or in LLM context; redact unnecessary PII before LLM calls; retention policies for CVs, assistant logs, exports; DPIA before launch. |
| **Explainable AI answers with sources** | Hallucinated claims about people influence staffing decisions. | Every AI statement about a person must cite evidence records; uncited claims are dropped or flagged; answers state what is *not* documented (as in the prototype's "No production LLM project is documented yet"); "Illustrative" vs "Live" tagging replaced by visible citations; human can always open the source. |
| **Evidence integrity** | Self-reported claims treated as confirmed. | Evidence level and confirmation status always shown; self-added items labelled "awaiting confirmation"; confirmation only by delivery lead; edits audited. |
| **Engineer agency** | Interests used to evaluate people. | Interests and curiosity used only for suggestions (copy: "It’s never used to evaluate you."); not exposed in Insights or matching order; withdraw anytime with immediate effect. |
| **Fictional demo data** | Demo environments leak real data or vice versa. | Separate demo tenant, seeded fictional data only; no production credentials; reset job. |
