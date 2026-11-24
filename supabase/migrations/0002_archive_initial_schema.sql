-- 0002: archive the 0001 draft without destroying anything.
--
-- WHY. 0001 was drafted before the domain settled (text slug keys, no verification model, 7 tables without RLS, an
-- owner policy that let people forge verification, a staff role that read private interests…). It has never been applied
-- to a project we can identify, but that cannot be PROVEN from the repository, so its file is preserved byte for byte and
-- history moves forward with additive migrations instead of editing it.
--
-- WHAT THIS DOES. Moves every 0001 table, with all of its rows, into the schema `legacy_0001`, which is not exposed by
-- the API and is locked down. Nothing is dropped or truncated. 0009 copies the rows that can be migrated safely into the
-- new schema; the rest stay here for a human to review. A later migration can drop `legacy_0001` once every environment is
-- confirmed migrated (that is the only destructive step, and it is deliberately not taken here).
--
-- The 0001 RLS policies and its two SECURITY DEFINER helpers are dropped first: they are code, not data, and the helpers
-- resolve `app_users` through `search_path = public`, which after this migration is the NEW table. Left in place they would
-- silently authorize against the wrong data.

drop policy if exists people_read on public.people;
drop policy if exists people_owner_update on public.people;
drop policy if exists evidence_read on public.skill_evidence;
drop policy if exists evidence_owner_write on public.skill_evidence;
drop policy if exists evidence_lead_confirm on public.skill_evidence;
drop policy if exists projects_read on public.project_experience;
drop policy if exists projects_owner_write on public.project_experience;
drop policy if exists interests_owner on public.career_interests;
drop policy if exists shortlists_owner on public.shortlists;
drop policy if exists proposals_staff on public.team_proposals;
drop policy if exists seats_staff on public.proposal_seats;
drop policy if exists eoi_owner on public.expressions_of_interest;
drop policy if exists eoi_staff_read on public.expressions_of_interest;
drop policy if exists notifications_recipient on public.notifications;
drop policy if exists notifications_mark_read on public.notifications;
drop policy if exists audit_admin_read on public.audit_log;

drop function if exists public.current_app_role();
drop function if exists public.owns_person(text);

create schema legacy_0001;

alter table public.app_users set schema legacy_0001;
alter table public.capabilities set schema legacy_0001;
alter table public.people set schema legacy_0001;
alter table public.skill_evidence set schema legacy_0001;
alter table public.project_experience set schema legacy_0001;
alter table public.certifications set schema legacy_0001;
alter table public.career_interests set schema legacy_0001;
alter table public.opportunities set schema legacy_0001;
alter table public.role_requirements set schema legacy_0001;
alter table public.assignments set schema legacy_0001;
alter table public.availability set schema legacy_0001;
alter table public.shortlists set schema legacy_0001;
alter table public.team_proposals set schema legacy_0001;
alter table public.proposal_seats set schema legacy_0001;
alter table public.expressions_of_interest set schema legacy_0001;
alter table public.notifications set schema legacy_0001;
alter table public.audit_log set schema legacy_0001;

-- Belt and braces: RLS on with no policy (default deny), and no API role may touch the schema at all.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'legacy_0001' loop
    execute format('alter table legacy_0001.%I enable row level security', t.tablename);
  end loop;
end $$;

revoke all on schema legacy_0001 from public, anon, authenticated, service_role;
revoke all on all tables in schema legacy_0001 from public, anon, authenticated, service_role;
revoke all on all sequences in schema legacy_0001 from public, anon, authenticated, service_role;

comment on schema legacy_0001 is 'Archive of the 0001 draft schema and its rows (migration 0002). Not exposed. Safe to drop once every environment is confirmed migrated.';
