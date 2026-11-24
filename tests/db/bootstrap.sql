-- Emulates the parts of a Supabase project that our migrations depend on, so they can run on a bare PostgreSQL (PGlite).
-- It is NOT Supabase: there is no PostgREST and no GoTrue here. It reproduces roles, the `auth` schema, auth.uid() and,
-- importantly, Supabase's DEFAULT PRIVILEGES (new objects in `public` are granted to anon/authenticated/service_role),
-- so a migration that forgets to revoke them is caught by the tests. Used by scripts/check-schema.mjs and tests/db/*.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
create table auth.users (id uuid primary key, email text unique);

-- Same lookup order as Supabase: the individual claim first, then the claims JSON.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
