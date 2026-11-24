-- Sparq Talent Intelligence — initial schema (PROPOSED, phase 2).
-- Mirrors src/domain/schemas.ts. Validated for syntax with PGlite (Postgres 16/17) using a stub
-- `auth` schema; NOT yet applied to a real Supabase project.
--
-- Principles enforced in the schema:
--  * No score/rank columns on people. Evidence is qualitative (level + detail + source).
--  * "Proposed" is not "assigned": assignments only exist after a human review decision.
--  * Engineers own their passport; staffing leads read passports and manage proposals.
--  * Every sensitive change can be audited (audit_log).

-- gen_random_uuid() is built into PostgreSQL 13+; no extension required.

-- ---------- Enums ----------
create type discipline as enum ('Mobile','Frontend','Backend','AI','Data','Cloud','Architecture','Quality');
create type evidence_level as enum ('professional','independent','training','emerging');
create type skill_group as enum ('mobile','web','ai','data','cloud','quality','architecture');
create type availability_status as enum ('confirmed','pending');
create type opportunity_status as enum ('Staffing','Open','Upcoming','Closed');
create type app_role as enum ('staffing_lead','engineer','delivery_lead','admin');
create type proposal_status as enum ('draft','in_review','approved','changes_requested','withdrawn');

-- ---------- Identity ----------
-- One row per authenticated user (auth.users is managed by Supabase Auth).
create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  title text not null default '',
  role app_role not null default 'engineer',
  person_id text unique,                -- set when the user owns a professional profile
  created_at timestamptz not null default now()
);

-- ---------- Talent ----------
create table capabilities (
  id text primary key,
  name text not null,
  grp skill_group not null,
  aliases text[] not null default '{}'
);

create table people (
  id text primary key,
  name text not null,
  headline text not null,
  discipline discipline not null,
  location text not null,
  country text,
  years_experience int not null check (years_experience >= 0),
  at_sparq_since int,
  languages text[] not null default '{}',
  summary text not null default '',
  top_skills text[] not null default '{}' check (cardinality(top_skills) <= 3),
  work_preferences text,
  passport_groups jsonb,                -- optional owner-defined grouping
  updated_at timestamptz not null default now()
);
alter table app_users add constraint app_users_person_fk foreign key (person_id) references people(id) on delete set null;

create table skill_evidence (
  id uuid primary key default gen_random_uuid(),
  person_id text not null references people(id) on delete cascade,
  capability_id text references capabilities(id),   -- null for custom skills awaiting curation
  label text not null,
  level evidence_level not null,
  detail text not null default '',
  self_reported boolean not null default false,
  confirmed_by uuid references app_users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on skill_evidence (person_id);
create index on skill_evidence (capability_id, level);

create table project_experience (
  id uuid primary key default gen_random_uuid(),
  person_id text not null references people(id) on delete cascade,
  period text not null,
  client text not null,
  client_category text,
  role text not null,
  title text not null,
  summary text not null default '',
  tags text[] not null default '{}',
  highlights text[] not null default '{}',
  source text not null default 'self-reported',
  confirmed_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index on project_experience (person_id);

create table certifications (
  id uuid primary key default gen_random_uuid(),
  person_id text not null references people(id) on delete cascade,
  name text not null,
  date_label text not null
);

create table career_interests (
  person_id text not null references people(id) on delete cascade,
  interest text not null,
  selected boolean not null default true,
  primary key (person_id, interest)
);

-- ---------- Staffing ----------
create table opportunities (
  id text primary key,
  client text not null,
  client_initials text not null,
  industry text not null,
  name text not null,
  short text not null,
  description text not null,
  status opportunity_status not null,
  kickoff date not null,
  duration_months int not null check (duration_months > 0),
  delivery_lead text not null,
  capabilities text[] not null default '{}',
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

create table role_requirements (
  id text primary key,
  opportunity_id text not null references opportunities(id) on delete cascade,
  title text not null,
  capabilities text[] not null default '{}',
  must_have text[] not null default '{}',
  nice_to_have text[] not null default '{}',
  seniority text,
  allocation_pct int check (allocation_pct between 1 and 100),
  proposed_person_id text references people(id)      -- proposal, not assignment
);
create index on role_requirements (opportunity_id);

-- Assignments are written ONLY when a proposal is approved by a human reviewer.
create table assignments (
  id uuid primary key default gen_random_uuid(),
  person_id text not null references people(id),
  project_name text not null,
  opportunity_id text references opportunities(id),
  starts_on date,
  ends_on date,
  end_confirmed boolean not null default false,
  delivery_lead text
);
create index on assignments (person_id);

-- Derived for fast reads; maintained by application code or a scheduled job.
create table availability (
  person_id text primary key references people(id) on delete cascade,
  available_from date not null,
  status availability_status not null,
  current_project text,
  current_project_ends date,
  delivery_lead text,
  proposed_opportunity_id text references opportunities(id),
  proposed_from date,
  updated_at timestamptz not null default now()
);

create table shortlists (
  owner_id uuid not null references app_users(id) on delete cascade,
  person_id text not null references people(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (owner_id, person_id)
);

create table team_proposals (
  id uuid primary key default gen_random_uuid(),
  opportunity_id text references opportunities(id),
  title text not null,
  brief text,
  status proposal_status not null default 'draft',
  created_by uuid not null references app_users(id),
  reviewer text,
  reviewer_note text,
  sent_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table proposal_seats (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references team_proposals(id) on delete cascade,
  role_title text not null,
  capabilities text[] not null default '{}',
  seniority text,
  allocation_pct int,
  person_id text references people(id),
  seat_state text not null default 'open' check (seat_state in ('open','proposed','confirmed'))
);

create table expressions_of_interest (
  id uuid primary key default gen_random_uuid(),
  person_id text not null references people(id) on delete cascade,
  role_requirement_id text not null references role_requirements(id) on delete cascade,
  note text,
  shared_with_staffing boolean not null default true,
  created_at timestamptz not null default now(),
  unique (person_id, role_requirement_id)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references app_users(id) on delete cascade,
  actor_person_id text references people(id),
  text text not null,
  href text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references app_users(id),
  action text not null,                  -- e.g. 'passport.export', 'shortlist.add', 'proposal.send'
  subject_type text not null,
  subject_id text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------- Row-level security ----------
create or replace function current_app_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from app_users where id = auth.uid()
$$;

create or replace function owns_person(pid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users where id = auth.uid() and person_id = pid)
$$;

alter table people enable row level security;
alter table skill_evidence enable row level security;
alter table project_experience enable row level security;
alter table career_interests enable row level security;
alter table shortlists enable row level security;
alter table team_proposals enable row level security;
alter table proposal_seats enable row level security;
alter table expressions_of_interest enable row level security;
alter table notifications enable row level security;
alter table audit_log enable row level security;

-- Passports: staff roles read all; engineers read their own.
create policy people_read on people for select using (current_app_role() in ('staffing_lead','delivery_lead','admin') or owns_person(id));
create policy people_owner_update on people for update using (owns_person(id)) with check (owns_person(id));

create policy evidence_read on skill_evidence for select using (current_app_role() in ('staffing_lead','delivery_lead','admin') or owns_person(person_id));
create policy evidence_owner_write on skill_evidence for all using (owns_person(person_id)) with check (owns_person(person_id) and self_reported);
create policy evidence_lead_confirm on skill_evidence for update using (current_app_role() = 'delivery_lead');

create policy projects_read on project_experience for select using (current_app_role() in ('staffing_lead','delivery_lead','admin') or owns_person(person_id));
create policy projects_owner_write on project_experience for all using (owns_person(person_id)) with check (owns_person(person_id));

-- Career interests are private to the person (used to surface opportunities to them).
create policy interests_owner on career_interests for all using (owns_person(person_id)) with check (owns_person(person_id));

create policy shortlists_owner on shortlists for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy proposals_staff on team_proposals for all using (current_app_role() in ('staffing_lead','delivery_lead','admin')) with check (current_app_role() in ('staffing_lead','admin'));
create policy seats_staff on proposal_seats for all using (current_app_role() in ('staffing_lead','delivery_lead','admin'));

create policy eoi_owner on expressions_of_interest for all using (owns_person(person_id)) with check (owns_person(person_id));
create policy eoi_staff_read on expressions_of_interest for select using (shared_with_staffing and current_app_role() in ('staffing_lead','admin'));

create policy notifications_recipient on notifications for select using (recipient_id = auth.uid());
create policy notifications_mark_read on notifications for update using (recipient_id = auth.uid());

create policy audit_admin_read on audit_log for select using (current_app_role() = 'admin');
-- Inserts into audit_log happen through server-side code with the service role.
