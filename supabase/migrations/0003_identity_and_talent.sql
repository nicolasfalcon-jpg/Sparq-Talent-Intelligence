-- 0003: identity, roles and the talent domain.
--
-- ID STRATEGY. Every persistent entity has a `uuid` primary key (gen_random_uuid()). People, capabilities, opportunities and
-- role requirements also carry a human-readable `slug` (unique, immutable by convention) for URLs, fixtures and tests; the app
-- keeps using slugs in routes and maps them to ids. Join tables use their natural composite keys. `app_users.id` is the
-- authenticated identity (auth.users.id).
--
-- ENUM REUSE. `discipline`, `skill_group`, `evidence_level`, `availability_status`, `opportunity_status` and `app_role`
-- already exist from 0001 and are reused as they are. `evidence_level` is the evidence SOURCE (professional / independent /
-- training / emerging); the columns that use it are called `source`, and verification is a separate enum.
--
-- Everything created here is inert until 0007 enables RLS and sets grants. Nothing is readable or writable through the API
-- before that, because 0007 revokes the default privileges Supabase hands to new tables.

create type verification_status as enum ('self_reported', 'pending', 'verified');
create type proposal_state as enum ('draft', 'submitted', 'changes_requested', 'approved', 'declined', 'withdrawn');
create type seat_state as enum ('open', 'proposed');
create type review_decision as enum ('approved', 'changes_requested', 'declined');
create type interest_status as enum ('shared', 'withdrawn');

-- Not exposed through the API (Supabase exposes `public`). Holds helpers and trigger functions; see 0006.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------------------------------------------------
create table capabilities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(btrim(name)) > 0),
  grp skill_group not null,
  aliases text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------------------------------
-- Professional profiles (Talent Passport subjects)
-- ---------------------------------------------------------------------------------------------------------------------
create table people (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(btrim(name)) > 0),
  headline text not null default '',
  discipline discipline not null,
  location text not null,
  country text,
  years_experience int not null check (years_experience >= 0),
  at_sparq_since int check (at_sparq_since between 1990 and 2100),
  languages text[] not null default '{}',
  summary text not null default '' check (length(summary) <= 600),
  top_skills text[] not null default '{}' check (cardinality(top_skills) <= 3),
  passport_groups jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger people_touch before update on people for each row execute function private.touch_updated_at();

-- Professional preferences (travel, team size…) live in their OWN table, not as a column of `people`: a row policy cannot hide
-- a single column of a row, and `people` is readable by staff. Here the whole row is the unit of disclosure.
create table person_preferences (
  person_id uuid primary key references people(id) on delete cascade,
  work_preferences text not null check (length(work_preferences) between 1 and 300),
  shared_with_staffing boolean not null default false,  -- private by default; voluntary and withdrawable
  updated_at timestamptz not null default now()
);
create trigger person_preferences_touch before update on person_preferences for each row execute function private.touch_updated_at();

create table career_journey_entries (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  position int not null,
  period_label text not null,
  role text not null,
  org text not null,
  is_current boolean not null default false,
  unique (person_id, position)
);

create table certifications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  issued_label text not null default '',
  position int not null default 0
);
create index certifications_person_idx on certifications (person_id);

-- ---------------------------------------------------------------------------------------------------------------------
-- Identity and roles
-- ---------------------------------------------------------------------------------------------------------------------
-- One row per authenticated identity. `person_id` is the explicit link between an identity and its professional profile
-- (null for people who have no profile, e.g. a staffing lead). It can only be set by an administrator, through a function.
create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  title text not null default '' check (length(title) <= 120),
  person_id uuid unique references people(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Roles are rows, not a column and not a JWT claim: a user can hold several, only an administrator can change them (through
-- audited functions), and nothing a user can edit about themselves (user_metadata) ever grants a permission.
create table user_roles (
  user_id uuid not null references app_users(id) on delete cascade,
  role app_role not null,
  granted_by uuid references app_users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- ---------------------------------------------------------------------------------------------------------------------
-- Evidence: SOURCE (`source`) and VERIFICATION (`verification`) are separate, and verification metadata is constrained.
-- ---------------------------------------------------------------------------------------------------------------------
create table skill_evidence (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  capability_id uuid references capabilities(id),            -- null for a custom skill that is not in the catalogue yet
  label text not null check (length(btrim(label)) between 2 and 60),
  source evidence_level not null,                            -- EVIDENCE SOURCE (domain field `level`)
  detail text not null default '' check (length(detail) <= 300),
  verification verification_status not null default 'self_reported',
  verified_by uuid references app_users(id) on delete restrict,   -- restrict: a reviewer with history cannot be deleted
  verified_at timestamptz,
  verification_note text check (length(verification_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Verified <=> there is a reviewer and a time. Anything else carries no verification metadata.
  constraint skill_evidence_verified_stamp check ((verification = 'verified') = (verified_by is not null and verified_at is not null)),
  constraint skill_evidence_unverified_clean check (verification = 'verified' or verification_note is null)
);
create index skill_evidence_person_idx on skill_evidence (person_id);
create index skill_evidence_capability_idx on skill_evidence (capability_id, source);
-- No exact duplicates (same skill label, capability and source), matching the application rule.
create unique index skill_evidence_unique_claim on skill_evidence (person_id, coalesce(capability_id, '00000000-0000-0000-0000-000000000000'::uuid), source, lower(label));
create trigger skill_evidence_touch before update on skill_evidence for each row execute function private.touch_updated_at();

-- Professional experience / selected work. Same verification model; replaces 0001's free-text `source`.
create table project_experience (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  sort_order int not null default 0,
  period_label text not null default '',
  client text not null,
  client_category text,                                      -- shown instead of the client name when exports hide client names
  role text not null,
  title text not null,
  summary text not null default '',
  tags text[] not null default '{}',
  highlights text[] not null default '{}',
  verification verification_status not null default 'self_reported',
  verified_by uuid references app_users(id) on delete restrict,
  verified_at timestamptz,
  verification_note text check (length(verification_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_experience_verified_stamp check ((verification = 'verified') = (verified_by is not null and verified_at is not null)),
  constraint project_experience_unverified_clean check (verification = 'verified' or verification_note is null)
);
create index project_experience_person_idx on project_experience (person_id, sort_order);
create trigger project_experience_touch before update on project_experience for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------------------------------------------------
-- Career goals and learning interests: PRIVATE BY DEFAULT.
-- ---------------------------------------------------------------------------------------------------------------------
create table career_interests (
  person_id uuid not null references people(id) on delete cascade,
  interest text not null check (length(btrim(interest)) between 1 and 80),
  selected boolean not null default true,
  shared_with_staffing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (person_id, interest),
  constraint career_interest_shared_requires_selected check (not shared_with_staffing or selected)
);
create trigger career_interests_touch before update on career_interests for each row execute function private.touch_updated_at();

-- Deselecting an interest withdraws any disclosure of it, and selecting it again does NOT re-share it: back to private.
create function private.career_interest_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if not new.selected then new.shared_with_staffing := false; end if;
  return new;
end $$;
create trigger career_interests_guard before insert or update on career_interests for each row execute function private.career_interest_guard();
