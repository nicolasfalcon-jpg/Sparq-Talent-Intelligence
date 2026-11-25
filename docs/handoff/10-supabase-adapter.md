# 10 · Supabase adapter, sessions and sign-in

Status: **written and unit-tested against a fake client only.** Nothing here has run against a real Supabase project (no credentials existed when it was written). Everything marked "remote only" below is verified exclusively by the remote integration tests (`tests/remote`, workstream F1).

## What it is

`SPARQ_DATA_SOURCE=supabase` switches `getRepositories()` to `src/data/repositories/supabase.ts` and `getSession()` to Supabase Auth. Memory mode (local fictional data, isolated tests) is unchanged. A deployed environment refuses memory mode (`src/lib/data-source.ts`).

| Piece | File |
|---|---|
| Request-scoped client (anon key + the caller's cookies) | `src/lib/supabase/server.ts` · `createRequestClient()` |
| Session refresh + login redirect | `src/lib/supabase/middleware.ts` · `updateSupabaseSession`, pure `decideAccess` |
| Sign-in page, action, sign-out | `src/app/login`, `src/features/auth/*`, `POST /logout` |
| Repositories | `src/data/repositories/supabase/*` (`talent`, `staffing`, `proposals`, `directory`, `mappers`, `db`, `ids`) |

## Security properties

- **Never privileged.** The app reads only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. A test greps `src/` for `SERVICE_ROLE`, `SUPABASE_DB_URL` and standalone `createClient(`. `service_role` has no grants on application tables in the schema anyway.
- **Every call runs as the user.** The repositories are a singleton *object*, not a connection: each method calls `createRequestClient()` at call time. Within one request the same client is reused (keyed by that request's cookie store in a `WeakMap`); another request gets its own. RLS and the SQL functions are the enforcement; `scopedTalent` and the policy remain a second layer.
- **Session.** Middleware validates with `auth.getUser()` (the Auth server), never the unverified cookie. The server-side session user comes from `my_identity()` (PostgREST verifies the JWT; `anon` cannot call it) plus `app_users.title` and the profile slug. The **role is read from `user_roles`, never from a token claim.** A user with several roles resolves to one with the fixed priority **staffing_lead > delivery_lead > engineer > admin**; a user with no valid role has no session.
- **Sign-in.** Email + password only. One generic message ("Email or password is incorrect.") for every credential failure, so the form cannot be used to discover accounts. `next` is accepted only as a same-origin path (`safeNextPath`: no `//`, backslashes, control characters, absolute URLs, `/login`, `/api`). No registration, no password reset, no SSO. Rate limiting is Supabase Auth's job.
- Only GET page navigations are redirected to `/login`; API routes and server actions answer 401 / typed errors themselves. `/logout` is POST-only.

## Mapping decisions

- Domain ids are **slugs** (people, capabilities, opportunities, roles); the database uses uuids. Reads embed the slug in the same query (`person:people(slug)`); writes resolve slugs once per request (`ids.ts`). Evidence, projects, proposals, seats, assignments keep their uuid as an opaque string id.
- `skill_evidence.source` ⇄ `SkillEvidence.level`; `verified_by` → `verifiedBy` (display name), `verified_at` → `verifiedOn`. Custom skills get `capabilityId = custom:<slug>`.
- Every `select` lists its columns (column grants make `select=*` fail on `app_users`). Writes send only owner-writable columns (verification metadata is never sent).
- `Opportunity.proposedPersonId` = the person in that role's seat of the **latest submitted or approved proposal the viewer can see**. `interestNote` is derived from visible shared expressions (the database has no free-text note). `deliveryLead` is "" when the viewer cannot read it (engineers).
- A seat with an assignment is `confirmed`; the database only stores `open | proposed`.
- Business "today" = the fictional dataset's date (`2026-11-24`, because availability, kick-offs and assignments are built around it) unless `SPARQ_TODAY=YYYY-MM-DD` is set. Set it to the real date once data is real.
- No notifications table yet: `listNotifications` returns `[]`.
- Errors: `42501 → ForbiddenError` (internal wording hidden), `PGRST301/302 → UnauthenticatedError`, `P0002/PGRST116 → NotFoundError`, `55000 → DomainRuleError(invalid_transition)`, `23514` capacity → `capacity_exceeded`, duplicates → `duplicate_evidence | duplicate_person | seat_already_confirmed | already_exists`, other constraint/format errors → `invalid_input`; anything else is an opaque error. New codes `invalid_input`, `already_exists` were added to `DomainRuleCode`.

## Known limits

- **`proposals.save` is not atomic.** It replaces seats with several PostgREST calls. It is fail-safe by compensation (old seats re-inserted on failure; a half-created draft is deleted) but a crash between calls could still leave a draft without seats. A `save_proposal` SQL function would make it atomic.
- The adapter does an extra lookup per request for slug resolution and the session; there is no cross-request cache by design.
- Engineers can only read published opportunities if migration `0010` is applied (owned by workstream F1).

## What is verified where

| Behaviour | Fake-client unit tests (here) | Remote only (`tests/remote`) |
|---|---|---|
| Query construction, explicit columns, RPC names/arguments, slug mapping, error mapping, redirect rules, generic sign-in error, role priority, no privileged credentials in `src/` | ✅ | |
| PostgREST embedding syntax actually working (`person:people(slug)`, `app_users!created_by(...)`, `proposal.state` filter on an `!inner` embed, to-one vs array embeds) | ❌ | ✅ |
| RLS, grants, triggers, SQL functions under real tokens; `anon` denied; cross-role denial; private data isolation | ❌ | ✅ |
| Real sign-in, token issuance, expiry/refresh, cookie round trip, `getUser()` validation | ❌ | ✅ |
| `my_identity()` for `anon` returning 42501 rather than an empty result | ❌ | ✅ |
| Concurrency (capacity) | ❌ | ✅ |

## Configuration the user must provide

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SPARQ_DATA_SOURCE=supabase`; optional `SPARQ_TODAY`. In Supabase Auth: disable sign-ups and anonymous sign-ins, set the Site URL / redirect URLs to the deployed origin, email confirmation off for the admin-created demo accounts.
