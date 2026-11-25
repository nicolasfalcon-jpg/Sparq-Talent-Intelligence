# 09 · Supabase development project: setup, provisioning and verification

Status: **scripts and tests written and verified locally (PGlite and a local fake server). Nothing has been run against a real Supabase project** (none existed when this was written). Passing the remote tests would show the reviewed behaviour on that one project; it would **not** make the system production-ready (see §8).

The project must be a **dedicated, fictional-data-only** Supabase project. Every script and remote test refuses to run against a remote project unless a human confirmed it (§3).

## 1. Order of a fresh setup

```
1. Create the Supabase project in the dashboard (you)            → §2
2. Configure Auth and the Data API in the dashboard (you)         → §4
3. Put the credentials in the right files (you)                   → §3
4. npm run db:migrate:dry-run     read-only: shows the plan, changes nothing
5. npm run db:migrate             applies migrations 0001…0011 in order, tracked (§5)
6. npm run db:provision           creates the 7 demo accounts in Supabase Auth (§6)
7. npm run db:seed                applies the fictional seed (needs step 6: it refuses without the accounts)
8. npm run test:remote            real-token integration tests (§7)
```

Steps 5 and 7 are the same tool (`scripts/db/migrate.mjs`); `--seed` applies `supabase/seed.sql` after the migrations. The seed is idempotent. **Do not skip step 6**: the seed only attaches application rows (profiles, roles, evidence…) to accounts that Supabase Auth already holds, and fails with a clear message if one is missing. A seed must never invent authentication identities.

On a brand-new project run all eleven migrations, including `0001` and `0002`: the later migrations were written to apply on top of them, and `legacy_0001` (empty on a fresh project) is preserved until its removal is separately authorized.

## 2. What to create in the dashboard

- A new project in a region close to the Vercel region you will deploy to. Use the current default Postgres major version and **write it down** (`select version()`): the migrations were verified on PGlite (an in-process PostgreSQL), and the runner rolls back any migration that fails, but only a real run proves compatibility.
- Pick a plan that will not pause an idle project before the demonstration (free projects can pause after a period of inactivity; check the current limits).

## 3. Environment variables

Two separate sets. **The application never sees the admin set.** A test (`tests/db/provision.test.ts`) fails if anything under `src/` mentions `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` or `SPARQ_CONFIRM_FICTIONAL_PROJECT`.

### Application runtime (`.env.local` locally; the Vercel project's environment variables when deployed)

| Variable | Value |
|---|---|
| `SPARQ_DATA_SOURCE` | `supabase` (a deployed environment refuses `memory`) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` (Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the project's `anon` public key |
| `ANTHROPIC_API_KEY` | server-side only; never `NEXT_PUBLIC_` |
| `SPARQ_ASSISTANT_MODEL` | defaults to `claude-sonnet-5-5` |
| `SPARQ_ASSISTANT_DAILY_LIMIT` | defaults to `40` calls per user per day (1–1000), enforced in the database with the user's own JWT (migration 0011) |

### Admin only (`.env.admin.local`, gitignored; read **only** by `scripts/db/*` and `tests/remote/*`; never on Vercel)

| Variable | Value |
|---|---|
| `SUPABASE_DB_URL` | Postgres connection string. Use the **session pooler** string (works over IPv4) or the direct string (`db.<ref>.supabase.co`, IPv6). Settings → Database |
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key; used only by `npm run db:provision` |
| `SPARQ_CONFIRM_FICTIONAL_PROJECT` | the project ref (the `<ref>` in the URL). **Nothing remote runs without it** |

`.env.admin.local` and `.demo-credentials.local.json` are gitignored. The scripts also read these variables from the process environment (the environment wins over the file). `NEXT_PUBLIC_SUPABASE_URL` and the anon key are also needed by `db:provision` and `test:remote`: keep them in `.env.admin.local` too, or export them.

### The fictional-project guard

Every admin script derives the project ref from the connection target (`postgres.<ref>@…pooler.supabase.com`, `db.<ref>.supabase.co`, or `<ref>.supabase.co` for the HTTP URL) and refuses to continue unless `SPARQ_CONFIRM_FICTIONAL_PROJECT` equals it exactly. A host it cannot attribute to a project (a lookalike domain, a custom host) is refused. Localhost needs no confirmation. Only the ref and host are ever printed, never credentials.

## 4. Dashboard settings required (the schema assumes them)

**Authentication**
- *Sign In / Providers → "Allow new users to sign up"*: **off** (no public registration). Demo accounts are created by the admin script, with the email already confirmed.
- *Anonymous sign-ins*: **off**.
- Keep only the Email provider; disable every other provider (no SSO in this release).
- *JWT expiry*: 3600 s (default) or shorter. The app refreshes sessions in its middleware.
- *URL configuration*: Site URL = the deployed app URL (and `http://localhost:3000` while developing).

**Data API (PostgREST)**
- *Exposed schemas*: **`public` only**. Remove `graphql_public` if nothing uses it. `private` (policy helpers), `legacy_0001` (the archived original tables), `sparq_migrations` (history) and `auth` must **never** be exposed: `npm run test:remote` checks it.
- Leave "Enable automatic RLS" on if offered; the migrations already enable RLS on every table and revoke Supabase's default grants.
- A sensible *Max rows* (1000) is fine.

**Not used**: Realtime, Storage, Edge Functions.

## 5. The migration runner (`scripts/db/migrate.mjs`)

| Command | Effect |
|---|---|
| `npm run db:migrate:status` | read-only: what is applied, what is pending |
| `npm run db:migrate:dry-run` | read-only: the plan, including the seed |
| `npm run db:migrate` | applies pending migrations in order |
| `npm run db:seed` | same, then applies `supabase/seed.sql` (idempotent) |
| `node scripts/db/migrate.mjs --baseline=<file>` | adopt a database that already has the schema without replaying it |

- **History**: the table `sparq_migrations.applied(filename, sha256, applied_at, applied_by)` in its own schema (RLS on, every privilege revoked from `anon`, `authenticated`, `service_role`; the schema is not exposed).
- **Transactions**: each migration and its history row commit together or not at all. A failed migration leaves nothing behind, later migrations are not attempted, and re-running after the fix is safe.
- **Drift**: an applied file whose checksum changed is refused. Never edit an applied migration; add a new one. A recorded file that disappeared, or a history that is out of order, is refused.
- **No blind replay**: a database that already contains the schema but has no history is refused until you adopt it with `--baseline`, which records the files up to that one *without executing them*.
- **Concurrency**: a Postgres advisory lock stops two runs from interleaving.
- Run it from a machine you control; it holds one connection. For non-local hosts it connects with TLS and does not verify the server certificate chain (`rejectUnauthorized: false`, as the Supabase pooler certificate is not in Node's default store). That is acceptable for a fictional-data development project and **not** for anything else.

Migrations added for the MVP: `0010_published_opportunities.sql` (engineers can read **Open** opportunities, plus any opportunity they shared interest in, with their role requirements, and nothing about people, proposals or reviewers; the delivery lead's name stays hidden from engineers) and `0011_assistant_usage.sql` (`consume_assistant_quota(limit)`, the per-user daily counter: closed table, `SECURITY DEFINER`, atomic upsert).

## 6. The demo accounts (`scripts/db/provision.mjs`)

Seven accounts, **one role each**, fictional people, reserved `.example` addresses that cannot receive mail:

| Key | Role | Email |
|---|---|---|
| laura | staffing lead | `laura@sparq-demo.example` |
| ana, lucia, camila | engineer | `<key>@sparq-demo.example` |
| rafael (Vela, Terra), ines (Cobalt, Nimbus) | delivery lead | `<key>@sparq-demo.example` |
| admin | administrator | `admin@sparq-demo.example` |

- Created through the Auth Admin API with the **fixed UUIDs** the seed uses, `email_confirm: true`, and a random 144-bit password per account.
- Passwords are written to `.demo-credentials.local.json` (mode 0600, gitignored) and are **never printed**. Share them with the people running the demonstration through a password manager, never in the repository or chat.
- **Idempotent**: an existing account only has its metadata refreshed; its password is not touched. `--rotate` issues new passwords. If an account exists but the credentials file lost its password, use `--rotate`. `--dry-run` prints the plan without any network call.
- It refuses an account that exists under the same id with a different email, a credentials file saved for another project, and any unconfirmed remote project.
- The database still supports several roles per user; the demo simply uses one. An engineer who is also a delivery lead is covered by the SQL tests.

## 7. Remote integration tests (`npm run test:remote`)

Real GoTrue tokens (password grant with the saved demo passwords) and PostgREST over HTTP, independent requests. They **skip with a printed reason** when no project is configured, and **fail loudly** (refuse to run) when a project is configured but not confirmed. They are not part of `npm run check`.

| File | Covers |
|---|---|
| `tests/remote/security.test.ts` | anonymous denial (every table, every RPC, the OpenAPI document); forged and tampered tokens rejected by signature; the access matrix sampled per role; private interests and preferences isolated (including withdrawing consent); evidence protection (no forged or self verification, verified rows immutable, reviewer-only decisions, column-level denial of `select=*`); privilege escalation (no self role grant, admin cannot change its own roles, role/reviewer/audit/review/assignment tables unwritable, identity columns immutable); schema exposure (`private`, `legacy_0001`, `sparq_migrations`, `auth`, `storage`, `extensions` unreachable; helpers not callable); the usage counter is closed |
| `tests/remote/staffing.test.ts` | a draft is private to its author; only the delivery lead of that opportunity can approve; approval creates no assignment; only after approval can that delivery lead confirm a seat, once; assignments cannot be edited or deleted; **concurrent capacity**: three parallel confirmations of 0.5 for one person in one window → exactly two succeed; two parallel full-time → exactly one; parallel confirmations in different windows all succeed |
| `tests/remote/helpers.test.ts` | the helpers themselves, against a local fake server (this one always runs) |

The staffing test creates throwaway proposals as Laura and reviews them as Rafael (Terra's delivery lead), for Lucía, in random far-future windows. If `SUPABASE_DB_URL` is available it deletes them afterwards over a guarded direct connection; otherwise they remain (fictional data, harmless).

## 8. What this does and does not establish

Verified locally: the runner's logic (ordering, checksums, baseline, dry-run, rollback, lock, guard) on PGlite; the provisioning conversation against a fake Admin API; the seed, migrations 0010/0011 and the whole schema under emulated Supabase roles (`npm run db:test`); the remote tests' plumbing.

**Not verified** until someone runs steps 4–8 against a real project: that the migrations apply on Supabase's actual Postgres major version and with the non-superuser `postgres` role (including `SECURITY DEFINER` functions owned by it); GoTrue's acceptance of the fixed UUIDs through the Admin API; PostgREST's behaviour for the column-level grants and the exposed-schema settings; the remote tests themselves. Even when all of that passes, the schema has had no load or abuse testing, no backup/restore or key-rotation procedure, and no review by anyone outside this project. It is a development foundation, not a production system.

## 9. Recovery

- A migration failed: read the message, fix the cause (a **new** migration if the failed one is already applied elsewhere; the failed file itself may be edited because it was never recorded), run `npm run db:migrate` again.
- The credentials file is lost: `npm run db:provision -- --rotate`.
- Start over on the development project: in the SQL editor, **only on the dedicated fictional-data project**, run `drop schema public cascade; drop schema private cascade; drop schema legacy_0001 cascade; drop schema sparq_migrations cascade; create schema public; grant usage on schema public to anon, authenticated, service_role;`, then repeat §1 from step 4. The demo accounts survive (they live in Auth) and keep their fixed UUIDs, so `db:provision` is not needed again.
