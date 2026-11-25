# 12 · Accelerated MVP: status, journey and deployment checklist

Written 2026-11-25 for the Thursday Nov 26 demonstration. **Fictional data only.** The app runs in two modes (`src/lib/data-source.ts`):

| Mode | Data and identity | Where it is allowed |
|---|---|---|
| `memory` (default) | fictional in-process fixtures + the demo persona cookie (**not authentication**) | local development and isolated tests only |
| `supabase` | Supabase PostgreSQL and Auth, request-scoped user JWT, RLS and SQL functions as the enforcement | everywhere, and **required** in a deployed environment |

A deployed environment (`VERCEL` set, or `SPARQ_DEPLOYED=1`) refuses memory mode and the persona cookie; `/persona` answers 404 under Supabase.

## What is built

| Area | State | Verified how |
|---|---|---|
| Four roles (engineer, staffing lead, delivery lead, admin), one role per demo account | done | unit (policy matrix) + e2e |
| Supabase adapter (all repositories), login/logout, session refresh | done, **never run against a real project** | fake-client unit tests only |
| Migrations 0010 (published opportunities) and 0011 (assistant usage), runner with history and checksums, account provisioning | done, **never run remotely** | PGlite DB tests + fake Admin API |
| Fill a Role, Build a Team (visual canvas), delivery-lead review, explicit assignment confirmation | done | unit + e2e in memory mode |
| Opportunities with proposal and assignment state, Compare (max 3), Planning (read-only), My Space, basic Insights (min group 3) | done | unit + e2e in memory mode |
| Sparq Intelligence (Claude, read-only tools, structured output, fallback, per-user limit) | done, **real model never called** | fake-client unit tests only |
| Security headers, production refusal of memory mode | done | typecheck, e2e (build) |

## Demonstration journey (verified in memory mode)

Discover talent → review a Passport → Build a Team → submit the proposal → Delivery Lead review (approving assigns nobody) → explicit assignment confirmation (a start before the person is free is refused by the capacity rule) → Planning → Ask Sparq. `tests/e2e/demo-journey.spec.ts`, both viewports. Real **login** needs a Supabase project: it is covered by unit tests only.

## Verification results (2026-11-25)

typecheck and ESLint clean; unit 610/610; DB 318/318 (PGlite, emulated Supabase roles); `db:check` OK (21 tables, 0 without RLS, 51 policies, 14 RPC functions); e2e 112 (both viewports). **Not run:** `npm run test:remote` (61 tests skip without credentials), anything against Supabase or the Anthropic API, a Vercel deployment. **Not production-ready.**

## Configuration you must provide

App runtime (Vercel and `.env.local`): `SPARQ_DATA_SOURCE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`; optional `SPARQ_ASSISTANT_MODEL` (default `claude-sonnet-5-5`), `SPARQ_ASSISTANT_EFFORT`, `SPARQ_ASSISTANT_DAILY_LIMIT` (default 40), `SPARQ_TODAY` (business date; defaults to the demo date 2026-11-24).
Admin scripts only (`.env.admin.local`, never in Vercel): `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SPARQ_CONFIRM_FICTIONAL_PROJECT=<project ref>`.
Order and dashboard settings: [09-supabase-setup.md](09-supabase-setup.md). Adapter notes: [10](10-supabase-adapter.md). Assistant: [11](11-sparq-intelligence.md).

## Deployment checklist (Vercel, not done)

Node 22 runtime (supabase-js warns about Node 20); the env vars above; Vercel Deployment Protection on; Supabase Site URL and redirect URLs set to the deployed origin; signups and anonymous sign-ins off; only `public` exposed; run `db:migrate`, `db:provision`, `db:seed`, then `test:remote` and read its result before any demonstration.

## Known limitations

`proposals.save` is not atomic (compensating, fail-safe; a `save_proposal` SQL function would fix it); PostgREST embed syntax and `my_identity` for anon are unproven; no notifications; engineers see the delivery lead name only where RLS allows; the memory demo cannot act as Inés (Cobalt cannot be reviewed there); nice-to-have requirements live in the proposal brief text; the assistant's real-model path, latency and strict output check are unproven; the memory usage counter is per process.
