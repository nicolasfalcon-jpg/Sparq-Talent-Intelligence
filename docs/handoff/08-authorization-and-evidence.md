# 08 · Authorization, evidence integrity, privacy and responsible discovery

Phase 2B.1 (application, in memory) and 2B.2 (database). §1–§6 describe what the running demo enforces today; §7–§10 describe what the database schema enforces and how that was verified. The database is **not connected to the app yet**: nothing here connects Supabase or uses an AI provider.

> **The demo identity is not authentication.** The persona cookie is unsigned and client-settable: anyone can become either persona. It exists only so the fictional demo can be explored. Everything below protects data **from the actor the session resolves to**; none of it is a security boundary until the session comes from real authentication.

## 1. Authorization model

**One policy, enforced at the data boundary.** [src/domain/policy.ts](../../src/domain/policy.ts) is the only place that decides who may do what. It is pure (`authorize(actor, permission, resource)` → allowed or a reason). Everything else calls it; presentation components never re-implement it.

| Permission | Staffing lead | Engineer |
|---|---|---|
| `workspace:staff`, `people:list`, `opportunities:read`, `shortlist:edit` | ✅ | ❌ |
| `workspace:personal` | ❌ | ✅ |
| `passport:read` (resource = person) | ✅ any | ✅ own only |
| `passport:edit` (resource = person) | ❌ never | ✅ own only |
| `interests:read-private` (resource = person) | ❌ never | ✅ own only |
| `assistant:ask` | ✅ | ✅ (contexts are role-scoped, §3) |

**Where it is enforced (defense in depth, none of it in JSX):**

| Boundary | Mechanism |
|---|---|
| Data access | [scopedTalent(repos, actor)](../../src/data/repositories/scoped.ts) wraps every people read: asserts the policy (typed `ForbiddenError`) and shapes the result (private interests and unshared preferences are never selected for a viewer who may not see them; redaction returns copies). |
| Queries | `getHomeView`, `getPeopleView`, `getPassportView`, `getPassportTitle`, `getOpportunitiesData` take the viewer, assert the policy and read through the scoped layer. |
| Pages | Pages call queries only, and use `guardPage` ([src/lib/access.ts](../../src/lib/access.ts)) to turn a `ForbiddenError` into the same redirect the layout performs. ESLint **forbids pages and routes from importing repositories** (`src/app/**`), so a new page cannot skip the query layer. |
| Server actions | `requireSession` → `assertAllowed(user, "passport:edit"/"shortlist:edit", …)` → Zod → domain rules. Always return `{ ok: false, error }`; never throw to the client. |
| Assistant | Route requires a session, request resolution authorizes context/suggestion/subject, the gateway reads only through `scopedTalent` (§3). |

Layouts still redirect (good UX), but they are no longer the protection. Layout and page render in parallel; the query refuses either way.

**Adding a read path:** write the query with a `viewer` parameter, call `assertAllowed`, read via `scopedTalent`. **Adding a mutation:** `requireSession` + a permission + Zod + a domain rule if the data has one. Add the permission to the matrix test in `tests/unit/policy.test.ts`.

**Not covered yet (by design):** Compare, Planning, Insights, My Space and Fill a Role/Build a Team do not exist. When they are built they must ship with a permission, a scoped read and tests. `GET /portraits/<id>` is public static art of fictional people; real photos would need authorization.

## 2. Demo identity (temporary)

[src/lib/demo-identity.ts](../../src/lib/demo-identity.ts) (constants), [src/lib/session.ts](../../src/lib/session.ts) (the only "who is calling?" seam), [src/middleware.ts](../../src/middleware.ts), `GET /persona`.

- **Strict:** `getSession()` returns `null` without a valid persona value. There is no hidden default role.
- `requireSession()` (actions, API) throws `UnauthenticatedError` → typed "session ended" result or `401`. `getSessionUser()` (pages) redirects to the demo sign-in.
- The middleware gives a persona cookie (staffing lead) to **page navigations only (GET)**, so the demo opens normally. API calls and action POSTs never receive one: an anonymous `/api/assistant` request is `401`.
- To adopt real authentication: replace the body of `getSession()`, delete `demo-identity.ts`, the middleware and `/persona`. The policy only ever sees an `Actor` (`id`, `role`, `personId`), so it does not change.
- Known demo weaknesses (accepted, demo only): the cookie is unsigned; `/persona` is a state-changing GET (CSRF-able); any visitor can pick either persona.

## 3. Ask Sparq authorization and contract

`POST /api/assistant` ([route](../../src/app/api/assistant/route.ts)):

1. **Session required** → `401 {error:{code:"unauthenticated"}}`.
2. **Strict Zod body** (unknown fields, oversized ids, 500-char limit) → `400 invalid_request`.
3. **Resolution** ([access.ts](../../src/features/ask-sparq/access.ts)) treats context, `promptId` and `subjectPersonId` as untrusted:
   - the **context** must exist for the user's role (engineers: `me`, `mypassport`; staff: the others). A context never widens access;
   - the **suggestion** must belong to that very context (no borrowing another context's data-bearing prompt);
   - the **subject**: "my passport" is derived from the session (naming anyone else is `403`); a staff `passport` subject is authorized and looked up (`403` / `404`); a subject anywhere else is `400`.
4. The **gateway** receives the resolved request and the `actor`.

Errors are `{error:{code,message}}` with `401/403/404/400/500`, `Cache-Control: no-store`, and never include protected data.

**Gateway contract** ([contract.ts](../../src/features/ask-sparq/contract.ts)): `answer(request: ResolvedAssistantRequest, actor): Promise<AssistantAnswer>`. A future LLM gateway implements the same interface and must: read people only through `scopedTalent(repos, actor)`, treat the question text as untrusted, never use private interests, never rank or score, never present unverified evidence as fact. The deterministic `RuleBasedAssistant` is unchanged in spirit and is also scoped: even if resolution were bypassed, an engineer's request for directory or someone else's passport data gets a plain "I can only use your own passport and open opportunities" answer with no data.

Out-of-scope free text from an engineer (inside their own context) is answered with that scope message (`200`, provenance `fallback`) rather than an error.

## 4. Evidence model: source and verification are separate

| Concept | Field | Values | Meaning |
|---|---|---|---|
| **Evidence source** | `level` (historical name; type alias `EvidenceSource`) | `professional` · `independent` · `training` · `emerging` | *Where it comes from*: professional experience, independent projects, education and training, learning and experimentation. Says nothing about trust. |
| **Verification status** | `verification` | `self_reported` · `pending` · `verified` | *Whether someone other than the owner confirmed it.* Default and only owner-reachable state: `self_reported`. |
| Verification stamp | `verifiedBy`, `verifiedOn` (partial date) | only when `verified` | Part of the verification history. |

`selfReported: boolean` and the free-text project `source` were removed: they encoded verification inside other fields. Projects use the same three fields. **Not documented** is the absence of any evidence row; it is never "no" and never needs confirmation.

**Business rules** (domain: [rules.ts](../../src/domain/rules.ts); enforced by the memory repository and the actions):
- An owner may declare professional experience and capabilities. Whatever source they choose, the row is created `self_reported`, with no stamp.
- Verification can never come from owner input: `AddSkillInput` is `.strict()` (a payload carrying `verification`, `verifiedBy`… is rejected, not ignored) and no owner action writes it. There is deliberately **no action that sets `pending` or `verified`**.
- An owner can withdraw self-reported and pending claims. **Verified evidence cannot be removed or altered by its owner** (typed `evidence_locked` error); the UI hides the ✕ on verified chips.
- Exact duplicates (same label, capability and source) are refused; a different label for the same capability is a different claim.
- Deselecting an interest also withdraws its disclosure (§5).

**Needs a future reviewer (delivery lead) role, not built:** verify or decline a pending claim; the owner's "request verification" (`self_reported → pending`); a **correction request** for verified evidence (owner asks, reviewer decides, history is kept); revoking a verification; confirming a self-reported project.

### Evidence-aware discovery

`matchPeople` stays deterministic and requirement-specific, and returns only `{ personId, matches }` (no score or rank). For each requested capability the best evidence is chosen (verified practical work first, professional over independent), and each match carries `level`, `verification` and `needsConfirmation`. People are ordered by, over the **requested** capabilities only:

1. requirements backed by **verified** practical experience (professional or independent);
2. of those, how many rest on professional work;
3. requirements backed by practical experience that **needs confirmation**;
4. of those, how many rest on professional work;
5. requirements with training or learning only;
6. earlier availability;
7. name (a neutral tie-break so the result never depends on input order).

Independent experience stays valuable: verified independent work outranks unverified professional work, and unverified independent work outranks verified training. Someone with only a self-reported claim is still found, and the claim is marked "self-reported" or "pending" (never presented as confirmed). The people screen says "Ordered by verified evidence for these requirements, then availability" (full rule in the tooltip).

## 5. Career-interest privacy

| Data | Default | Who can see it | Control |
|---|---|---|---|
| Career goals and learning interests (`CareerInterests.interests`) | **private** | the owner only | owner selects/deselects |
| Interests the owner shares (`CareerInterests.shared`, subset of selected) | shared only on request | staffing leads (labels only) | owner, per item, reversible |
| Professional preferences (`workPreferences`) | private unless `workPreferencesShared` | owner; staff only if shared | owner |
| Interest in a *specific opportunity* | — | **a separate concept (expressions of interest, phase 2): not built** | — |

Enforced in **data selection**: `scopedTalent.getInterests` returns the full record only to the owner; for everyone else it returns the shared labels (not even a count of what is private); `redact` removes unshared `workPreferences` from the person copy handed to staff. Because the passport view model is serialized into the page, tests assert the staff payload **as JSON** contains no private label, in HTML and in the RSC payload. Exports contain no interests or preferences at all (tested with the owner's own, fullest view). Assistant answers never read interests (tested across every suggestion and several probing questions, for both roles).

## 6. Responsible talent discovery (Ask Sparq policy)

[src/domain/talent-policy.ts](../../src/domain/talent-policy.ts), deterministic, pure, tested. **Boundary:** a request is declined when it is about **people**, asks the assistant to **evaluate, order, decide or infer** (instead of retrieving documented facts), and rests on a person's **general worth or a protected/unrelated characteristic** instead of an explicit requirement.

| Category | Declined examples | Always allowed |
|---|---|---|
| `ranking` | "Rank the engineers from best to worst", "Who is the best React Native engineer?", "top 5 engineers", "¿Quién es el mejor ingeniero?" | "Who knows React Native and native iOS?", "Who is the best **match** for this role?", ordering by availability |
| `scoring` | "Score each engineer 1–10", "How good is Mateo?", "performance review of Ana" | "Who has credit scoring / rate limiting / performance testing experience?" |
| `weakest` | "Who is the weakest engineer?", "low performers", "who should be fired" | |
| `personal_traits` | "Is Mateo reliable?", "How old is Ana?", "Will Daniel quit?" | "Who has built reliable payment systems?" |
| `autonomous_decision` | "Assign Ana to Vela", "Staff the project for me", "Who should I assign?" | "Staff available in January?", "Select engineers with Swift experience" |

A decline gives a short explanation and a requirement-based alternative; for "who is the best X" it also lists who has **documented** X experience, with evidence basis, noting "the order is not a ranking of people". The answers themselves never contain scores, rankings or unverified claims presented as fact.

**Limitations (deliberate and documented):** a lexical + structural heuristic over English and basic Spanish. It misses paraphrases without evaluative vocabulary ("who really shines at mobile work?"), other languages, and long indirect requests; it can over-decline an unusual phrasing (e.g. an adjective next to a person word). "Who has the most X experience?" is treated as requirement-based discovery. It is a guardrail for the deterministic gateway, **not** a safety classifier: a future LLM gateway needs its own policy layer, tool allow-lists, red-team evals and logging. Also: the canned *illustrative* answers (e.g. "Which opportunity is hardest to staff?") make fixed claims about named people; they are labelled "Illustrative example" and only available to staff, but they are static text.

## 7. Database access model (phase 2B.2, implemented in `supabase/migrations/0002`–`0009`)

Status: **designed and verified in PGlite with emulated Supabase roles; not applied to a Supabase project; not production-ready** (§9). The old draft `0001` is kept unchanged as history and must not be applied on its own: `0002` archives it into the locked schema `legacy_0001`. Entity design, ids, state machines and migration order: [04](04-data-domain.md) §7–§13.

### Principles

1. **RLS on every table** (20 in `public`, including the 7 that had none), **plus column-level GRANTs.** A row policy cannot hide one column of a visible row, so verification metadata, role assignments and identity links are protected by what API roles may `SELECT/INSERT/UPDATE` per column.
2. **Least privilege, `anon` and `authenticated` reviewed separately.** Everything is revoked first (including Supabase's default privileges on new objects), then granted back per column. `anon` has nothing (no table, no function). `service_role` has nothing on application tables either: the application must never need it, and a missing policy is fixed, not bypassed.
3. **Roles live in `user_roles`, never in the JWT** (a token cannot grant itself a role). Four roles: `engineer`, `staffing_lead`, `delivery_lead`, `admin`.
4. **A role alone never opens an operation.** Reviewing a proposal needs to be the delivery lead *assigned to that opportunity*; verifying evidence needs a *working relationship* with the person; confirming an assignment needs an *approved* proposal on one's own opportunity. **Admin has no business powers** (cannot see interests, review, verify or confirm) and cannot change its own roles, link or assignments.
5. **Privileged changes have no table grants.** Role changes, verification, proposal state, reviews, assignments and audit rows exist only as 13 `SECURITY DEFINER` functions: `set search_path = ''`, schema-qualified, EXECUTE revoked from PUBLIC/anon/service_role, actor always `auth.uid()` (never a parameter), every denial written `… is not true` (NULL-safe), each writing an audit row.
6. **Integrity triggers are defense in depth**, independent of RLS: they still hold if a policy or grant is later widened (tested by disabling RLS and widening grants).
7. **Policies are `to authenticated` only; no policy for a command means that command is denied.**

### Access matrix (what each role can do through the API)

R = read, C = create, U = update, D = delete. "own" = the profile linked to the caller. "—" = no access (RLS returns zero rows or the grant is missing).

| Resource | Engineer | Staffing lead | Delivery lead | Admin |
|---|---|---|---|---|
| Directory (`app_users`: name, title) | R | R | R | R; U own name/title (all roles) |
| Roles (`user_roles`) | R own | — | R own | R all; manage others via `grant/revoke_user_role` |
| Profile link (`person_id`) | `my_identity()` only | same | same | `link_user_profile` (not own) |
| Capabilities catalogue | R | R | R | R + C/U/D |
| Profile (`people`) | R own; U summary, headline, languages, top skills, groups | R all | R people they work with | R the profile record only (no evidence, interests or preferences) |
| Journey, certifications | R/C/U/D own | R all | R people they work with | — |
| Evidence & experience | R own; C `self_reported` only; U/D unverified only; request/withdraw confirmation | R all | R people they work with; **verify / decline / revoke** with a working relationship | — |
| Career interests | R/C/U/D own (private by default) | R only rows **selected and shared** | — | — |
| Work preferences | R/C/U/D own | R only while **shared** | — | — |
| Opportunities & roles | — | R all; C; U/D own | R those they are assigned to | R |
| Delivery-lead assignment | — | R | R own | `assign_delivery_lead` |
| Shortlists | — | R/C/D own | — | — |
| Team proposals & seats | — | C; R own drafts and all submitted; U/D drafts and changes-requested own; `submit/withdraw` own | R submitted proposals of their opportunity; **review** (approve / decline / request changes) their opportunity's proposals, never as author | — |
| Proposal reviews | — | R | R | — |
| Assignments | R own | R all | R those they lead; **`confirm_assignment`** per seat of an approved proposal on their opportunity | — |
| Expressions of interest | C/R/U own, only for roles open for interest; withdraw | R only while shared | R only while shared, on their opportunity | — |
| Audit log | R what they did, evidence verification of own profile, own export records | R what they did, evidence events | R what they did, evidence events they can review | R all |
| Availability | `person_availability()` returns only people and assignments RLS lets the caller see | all | their people | basic |

Direct writes to `user_roles`, `opportunity_delivery_leads`, `proposal_reviews`, `assignments`, `audit_log` are impossible for every API role (no grant, and triggers refuse even if one is added).

### Evidence integrity rules (database)

Source and verification are separate columns with a CHECK tying `verified` to its stamp. Owners cannot insert anything but `self_reported`, cannot write `verification`, `verified_by`, `verified_at`, `verification_note`, cannot alter or delete `verified` rows. A reviewer verifies, declines or revokes only through `decide_evidence_verification`; no self-verification; every change is an `audit_log` row (append-only). Editing the content of a `pending` claim resets it to `self_reported`.

### Privacy rules (database)

Private interests and unshared preferences are not selected for staffing at all (excluded by policy, not hidden in a view), so they cannot be read or counted. Withdrawing consent hides the data at the next query. Exports must be recorded through `record_profile_export` (owner-visible), which is how phase 2 will notify the owner. Opportunity interest is a separate entity.

## 8. Audit

`audit_log` (bigint identity; actor, action, subject, `subject_person_id`, details jsonb) is written only by the privileged functions: `evidence.*` (request, withdraw, verify, decline, revoke), `permission.grant`, `permission.revoke`, `permission.link_profile`, `permission.assign_delivery_lead`, `proposal.submit`, `proposal.withdraw`, `proposal.review`, `assignment.confirm`, `profile.export`. API roles cannot insert, update, delete or truncate (no grant + triggers). Read access follows the access matrix. Not yet audited: shortlist changes, ordinary profile edits, assistant queries (phase 2C+).

## 9. Verification results (what was executed, and what was not)

**Executed** (`npm run db:test`, 262 tests in 10 files, deterministic): every migration, in order, then the seed, in PGlite 0.6.0 (PostgreSQL engine, WASM, in-process) with `tests/db/bootstrap.sql` emulating Supabase: roles `anon`, `authenticated`, `service_role (bypassrls)`, an `auth` schema with `auth.uid()` reading `request.jwt.claim.sub`, and Supabase-style default privileges (so a forgotten revoke is caught). Tests switch roles for real (`set local role`) with each seeded persona.

| File | Tests | What it proves |
|---|---|---|
| `migrations.test.ts` | 10 | 0001 byte-identical; archive; copy into populated legacy DB with no row lost, trust never upgraded, unreviewed proposals/assignments not promoted, idempotent re-run, archive locked |
| `schema.test.ts` | 27 | catalog: RLS on all, anon none, service_role none, no PUBLIC execute, `search_path` pinned, RPC surface exactly 13, no text FKs, NULL-safe predicates |
| `seed.test.ts` | 17 | 12 profiles, counts, relationships, idempotency, availability parity with the fixtures |
| `constraints.test.ts` | 30 | state transitions, allocation, capacity, checks, uniqueness |
| `availability.test.ts` | 16 | the documented availability/conflict rules |
| `rls-read.test.ts` | 50 | who can read what, per role and resource |
| `rls-evidence.test.ts` | 34 | no forged/self verification, verified immutability, reviewer-only decisions, history |
| `rls-privilege.test.ts` | 24 | no self-escalation, admin limits, function privileges, direct-write denial, defense in depth |
| `rls-privacy.test.ts` | 27 | private interests/preferences, consent withdrawal, EOI visibility |
| `rls-staffing.test.ts` | 27 | proposal lifecycle, separation of duties, assignment confirmation, capacity |

Also: a one-off **mutation check** run during this phase (each of 22 protections weakened in a scratch copy of the SQL: 22/22 caught by at least one test; the script is not part of the repository); two real bugs found and fixed by these tests (a NULL three-valued-logic hole in `owns_person`/denial checks, and an `INSERT … RETURNING` visibility problem in `proposals_read`; both now have permanent regression tests). `npm run db:check` applies migrations + seed and prints a structural summary (20 tables, 0 without RLS, 49 policies, 13 RPC functions, 0 tables reachable by anon).

**Not executed / not proven:**
- No real Supabase: no PostgREST, GoTrue/Auth, HTTP layer, JWT verification, or schema-exposure configuration. The emulated `auth` schema is minimal; real `auth.users` has more columns and its own triggers.
- No remote or persistent database was touched.
- No load or concurrency test (the advisory-lock capacity check is only exercised sequentially).
- The app does not use the schema yet: no adapter exists, so end-to-end behaviour of the app on this schema is unverified.

## 10. Remaining database risks and Phase 2C prerequisites

**Risks**
- PGlite ≠ Supabase (above). The first run against a real Supabase **local** stack (needs Docker and the Supabase CLI, which require approval) must re-run these tests unchanged.
- **Only `public` may be exposed by the API.** `private` and `legacy_0001` must never be added to the exposed schemas. `usage` on `private` is granted to `authenticated` so policies can evaluate; that does not expose its functions through the API unless the schema is exposed.
- `legacy_0001` still holds the old data (locked); it must be dropped in a later migration once the copy is verified.
- Invented seed data (start dates, stamps, partial-date precision) is documented in [04](04-data-domain.md) §13.
- Not built: engineer view of opportunities (My Space), assignment end-date confirmation / cancellation, evidence correction-request workflow, notifications table (left in legacy), `assistant_messages`.
- The domain `UserRole` still has 2 roles; the database has 4.

**Phase 2C prerequisites (not started)**
1. Approval to run the Supabase local stack, then run the DB tests against it; confirm real `auth.users` compatibility with the seed.
2. Signup trigger creating `app_users` with **no roles**; SSO claim → role mapping through the admin functions (never trusting token claims).
3. Supabase adapter implementing the repository interfaces: slug ↔ uuid, `level` → `source`, `verifiedBy` display, 4-role `UserRole`, replaces `getSession()` only; keep `scopedTalent` as the second layer; reads through the user's JWT, never the service role.
4. Decide the remaining product questions above (engineer opportunity visibility, end-date confirmation, correction requests).
5. Migration to drop `legacy_0001`.

## 11. Remaining application risks

Demo identity is not security; no security headers/CSP in `next.config.ts`; data is in server memory; the policy detector is heuristic (§6); illustrative assistant answers are static; engineers have no opportunity view yet (`opportunities:read` is staff-only); the public `portraits` route; and the app's authorization is not yet backed by RLS at runtime (the database rules in §7 are verified in isolation only).
