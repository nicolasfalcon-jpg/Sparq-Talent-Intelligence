-- 0008: row-level security AND grants. The single place where access is defined. See docs/handoff/08-authorization-and-evidence.md §7
-- for the access matrix this implements.
--
-- PRINCIPLES
--  1. RLS alone is not enough, and grants alone are not enough. Rows are filtered by policies; WHICH COLUMNS an API role can read
--     or write is decided by column-level GRANTs, because a row policy cannot hide one column of a visible row (that is how
--     verification metadata, role assignments and identity links are kept out of reach of their own subjects).
--  2. Supabase's default privileges hand every new table in `public` to anon, authenticated and service_role. We revoke all of
--     that first and grant back the minimum, per column. New tables in `public` get nothing by default (see the end).
--  3. `anon` gets NOTHING: no table, no function. `service_role` gets nothing on application tables either: the application never
--     uses it, and a missing policy must be fixed, not bypassed.
--  4. Roles are read from `user_roles` (never from the JWT). A role alone does not open an operation: reviewing, verifying and
--     confirming also require a relationship (an assignment to the opportunity or to the person). Admin has no business powers.
--  5. Privileged changes (roles, verification, proposal state, reviews, assignments, audit rows) have NO table grants at all:
--     they exist only as the SECURITY DEFINER functions of 0006.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Start from nothing
-- ---------------------------------------------------------------------------------------------------------------------
revoke all on all tables in schema public from public, anon, authenticated, service_role;
revoke all on all sequences in schema public from public, anon, authenticated, service_role;
revoke all on all functions in schema public from public, anon, authenticated, service_role;
revoke all on all functions in schema private from public, anon, authenticated, service_role;

-- Objects created later by the migration role must not inherit Supabase's grants either.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. RLS on every table of the API schema
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Column-level grants for `authenticated`. Anything not listed is not reachable through the API.
-- ---------------------------------------------------------------------------------------------------------------------
grant usage on schema private to authenticated;

-- Identity. `person_id` is NOT selectable (use my_identity()); nobody can write role or link columns.
grant select (id, display_name, title, created_at) on app_users to authenticated;
grant update (display_name, title) on app_users to authenticated;
grant select (user_id, role, granted_at) on user_roles to authenticated;

grant select on capabilities to authenticated;
grant delete on capabilities to authenticated;
grant insert (slug, name, grp, aliases), update (name, grp, aliases) on capabilities to authenticated;

-- Profiles. Owners can edit how they describe themselves, not HR facts (name, discipline, years, location…).
grant select on people to authenticated;
grant update (summary, headline, languages, top_skills, passport_groups) on people to authenticated;

grant select, delete on person_preferences to authenticated;
grant insert (person_id, work_preferences, shared_with_staffing), update (work_preferences, shared_with_staffing) on person_preferences to authenticated;

grant select, delete on career_journey_entries to authenticated;
grant insert (person_id, position, period_label, role, org, is_current), update (position, period_label, role, org, is_current) on career_journey_entries to authenticated;

grant select, delete on certifications to authenticated;
grant insert (person_id, name, issued_label, position), update (name, issued_label, position) on certifications to authenticated;

-- Evidence. `verification`, `verified_by`, `verified_at`, `verification_note` are not writable: not on insert (so they take the
-- default 'self_reported'), not on update, ever, by anyone but the functions.
grant select, delete on skill_evidence to authenticated;
grant insert (person_id, capability_id, label, source, detail), update (capability_id, label, source, detail) on skill_evidence to authenticated;

grant select, delete on project_experience to authenticated;
grant insert (person_id, sort_order, period_label, client, client_category, role, title, summary, tags, highlights),
      update (sort_order, period_label, client, client_category, role, title, summary, tags, highlights) on project_experience to authenticated;

grant select, delete on career_interests to authenticated;
grant insert (person_id, interest, selected, shared_with_staffing), update (selected, shared_with_staffing) on career_interests to authenticated;

-- Staffing.
grant select on opportunities to authenticated;
grant insert (slug, client, client_initials, industry, name, short, description, status, kickoff, duration_months, capabilities),
      update (client, client_initials, industry, name, short, description, status, kickoff, duration_months, capabilities) on opportunities to authenticated;

grant select, delete on role_requirements to authenticated;
grant insert (slug, opportunity_id, sort_order, title, capabilities, must_have, nice_to_have, seniority, allocation),
      update (sort_order, title, capabilities, must_have, nice_to_have, seniority, allocation) on role_requirements to authenticated;

grant select on opportunity_delivery_leads to authenticated;      -- writes: assign_delivery_lead() only

grant select, delete on shortlists to authenticated;
grant insert (owner_id, person_id) on shortlists to authenticated;

grant select, delete on team_proposals to authenticated;           -- state, version and stamps: submit/withdraw/review functions only
grant insert (opportunity_id, title, brief, note_for_reviewer), update (opportunity_id, title, brief, note_for_reviewer) on team_proposals to authenticated;

grant select, delete on proposal_seats to authenticated;
grant insert (proposal_id, role_requirement_id, position, title, capabilities, seniority, allocation, person_id, seat_state),
      update (role_requirement_id, position, title, capabilities, seniority, allocation, person_id, seat_state) on proposal_seats to authenticated;

grant select on proposal_reviews to authenticated;                 -- written by review_proposal() only
grant select on assignments to authenticated;                      -- written by confirm_assignment() only
grant select on audit_log to authenticated;                        -- written by the privileged functions only

grant select on expressions_of_interest to authenticated;
grant insert (person_id, role_requirement_id, note), update (status, note) on expressions_of_interest to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Function grants. Everything starts revoked (above); only `authenticated` gets what it needs.
-- ---------------------------------------------------------------------------------------------------------------------
-- Read-only helpers that policies call as the querying role.
grant execute on function
  private.has_role(public.app_role), private.is_admin(), private.current_person_id(), private.owns_person(uuid),
  private.leads_opportunity(uuid), private.is_reviewer_for_person(uuid), private.can_read_profile(uuid),
  private.can_see_opportunity(uuid), private.owns_opportunity(uuid), private.role_opportunity(uuid),
  private.role_open_for_interest(uuid), private.can_see_proposal(uuid), private.can_edit_proposal(uuid)
to authenticated;

-- The privileged operations. Each checks its actor and writes an audit row; none is granted to anon or service_role.
grant execute on function
  public.request_evidence_verification(text, uuid, boolean), public.decide_evidence_verification(text, uuid, text, text),
  public.submit_proposal(uuid, text), public.withdraw_proposal(uuid), public.review_proposal(uuid, public.review_decision, text),
  public.confirm_assignment(uuid, date, date, date, numeric), public.record_profile_export(uuid, text, boolean),
  public.grant_user_role(uuid, public.app_role), public.revoke_user_role(uuid, public.app_role),
  public.link_user_profile(uuid, uuid), public.assign_delivery_lead(uuid, uuid, boolean), public.my_identity(),
  public.person_availability(date)
to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Policies (all `to authenticated`; with no policy for a command, that command is denied)
-- ---------------------------------------------------------------------------------------------------------------------

-- Identity and roles
create policy app_users_directory on app_users for select to authenticated using (true);   -- names and titles only (column grants)
create policy app_users_self_update on app_users for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy user_roles_read on user_roles for select to authenticated using (user_id = auth.uid() or private.is_admin());

-- Reference data
create policy capabilities_read on capabilities for select to authenticated using (true);
create policy capabilities_admin_insert on capabilities for insert to authenticated with check (private.is_admin());
create policy capabilities_admin_update on capabilities for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy capabilities_admin_delete on capabilities for delete to authenticated using (private.is_admin());

-- Profiles: staffing leads read all; owners read their own; a delivery lead reads people they work with; admin reads the basic record.
create policy people_read on people for select to authenticated using (private.can_read_profile(id) or private.is_admin());
create policy people_owner_update on people for update to authenticated using (private.owns_person(id)) with check (private.owns_person(id));

create policy preferences_owner_all on person_preferences for all to authenticated using (private.owns_person(person_id)) with check (private.owns_person(person_id));
-- Staffing leads see a preference ONLY while its owner shares it: withdrawing hides it from the next query.
create policy preferences_staff_read on person_preferences for select to authenticated using (shared_with_staffing and private.has_role('staffing_lead'));

create policy journey_read on career_journey_entries for select to authenticated using (private.can_read_profile(person_id));
create policy journey_owner_write on career_journey_entries for all to authenticated using (private.owns_person(person_id)) with check (private.owns_person(person_id));
create policy certifications_read on certifications for select to authenticated using (private.can_read_profile(person_id));
create policy certifications_owner_write on certifications for all to authenticated using (private.owns_person(person_id)) with check (private.owns_person(person_id));

-- Evidence and experience: owners add self-reported rows and withdraw unverified ones; nobody edits a verified row.
create policy evidence_read on skill_evidence for select to authenticated using (private.can_read_profile(person_id));
create policy evidence_owner_insert on skill_evidence for insert to authenticated with check (private.owns_person(person_id) and verification = 'self_reported');
create policy evidence_owner_update on skill_evidence for update to authenticated
  using (private.owns_person(person_id) and verification <> 'verified') with check (private.owns_person(person_id) and verification <> 'verified');
create policy evidence_owner_delete on skill_evidence for delete to authenticated using (private.owns_person(person_id) and verification <> 'verified');

create policy projects_read on project_experience for select to authenticated using (private.can_read_profile(person_id));
create policy projects_owner_insert on project_experience for insert to authenticated with check (private.owns_person(person_id) and verification = 'self_reported');
create policy projects_owner_update on project_experience for update to authenticated
  using (private.owns_person(person_id) and verification <> 'verified') with check (private.owns_person(person_id) and verification <> 'verified');
create policy projects_owner_delete on project_experience for delete to authenticated using (private.owns_person(person_id) and verification <> 'verified');

-- Career goals and learning interests: private. Staffing sees ONLY rows the owner selected and shared; private rows are not
-- returned at all (so they cannot even be counted). Delivery leads and admins have no access.
create policy interests_owner_all on career_interests for all to authenticated using (private.owns_person(person_id)) with check (private.owns_person(person_id));
create policy interests_staff_read on career_interests for select to authenticated using (shared_with_staffing and selected and private.has_role('staffing_lead'));

-- Opportunities and their roles: staffing leads, the assigned delivery leads, and (read-only) admins. Engineers have no access
-- until the My Space design decides what they may see; that avoids exposing proposals through role requirements.
create policy opportunities_read on opportunities for select to authenticated using (private.can_see_opportunity(id));
create policy opportunities_insert on opportunities for insert to authenticated with check (private.has_role('staffing_lead') and created_by = auth.uid());
create policy opportunities_update on opportunities for update to authenticated using (private.owns_opportunity(id)) with check (private.owns_opportunity(id));

create policy roles_read on role_requirements for select to authenticated using (private.can_see_opportunity(opportunity_id));
create policy roles_insert on role_requirements for insert to authenticated with check (private.owns_opportunity(opportunity_id));
create policy roles_update on role_requirements for update to authenticated using (private.owns_opportunity(opportunity_id)) with check (private.owns_opportunity(opportunity_id));
create policy roles_delete on role_requirements for delete to authenticated using (private.owns_opportunity(opportunity_id));

create policy delivery_leads_read on opportunity_delivery_leads for select to authenticated
  using (private.has_role('staffing_lead') or private.is_admin() or user_id = auth.uid());

create policy shortlists_owner on shortlists for all to authenticated
  using (owner_id = auth.uid() and private.has_role('staffing_lead')) with check (owner_id = auth.uid() and private.has_role('staffing_lead'));

-- Proposals: drafts are private to their author; submitted proposals are visible to staffing leads and the opportunity's delivery lead.
-- Evaluated on the row's own columns on purpose: a helper that looked the proposal up by id would not see a row being inserted by the very
-- same statement (INSERT ... RETURNING), and the author would be refused sight of their own new draft. Child tables use the helper (their
-- parent already exists).
create policy proposals_read on team_proposals for select to authenticated using (
  created_by = auth.uid()
  or (state <> 'draft' and (private.has_role('staffing_lead') or private.leads_opportunity(opportunity_id)))
);
create policy proposals_insert on team_proposals for insert to authenticated with check (private.has_role('staffing_lead') and created_by = auth.uid());
create policy proposals_update on team_proposals for update to authenticated
  using (created_by = auth.uid() and private.has_role('staffing_lead') and state in ('draft', 'changes_requested')) with check (created_by = auth.uid());
create policy proposals_delete on team_proposals for delete to authenticated using (created_by = auth.uid() and state = 'draft');

create policy seats_read on proposal_seats for select to authenticated using (private.can_see_proposal(proposal_id));
create policy seats_insert on proposal_seats for insert to authenticated with check (private.can_edit_proposal(proposal_id));
create policy seats_update on proposal_seats for update to authenticated using (private.can_edit_proposal(proposal_id)) with check (private.can_edit_proposal(proposal_id));
create policy seats_delete on proposal_seats for delete to authenticated using (private.can_edit_proposal(proposal_id));

create policy reviews_read on proposal_reviews for select to authenticated using (private.can_see_proposal(proposal_id));

-- Assignments: staffing leads see all; a person sees their own; a delivery lead sees the ones they lead.
create policy assignments_read on assignments for select to authenticated
  using (private.has_role('staffing_lead') or private.owns_person(person_id) or (private.has_role('delivery_lead') and delivery_lead_id = auth.uid()));

-- Expressions of interest: the owner manages them; stakeholders see them only while shared.
create policy eoi_owner_read on expressions_of_interest for select to authenticated using (private.owns_person(person_id));
create policy eoi_owner_insert on expressions_of_interest for insert to authenticated
  with check (private.owns_person(person_id) and status = 'shared' and private.role_open_for_interest(role_requirement_id));
create policy eoi_owner_update on expressions_of_interest for update to authenticated
  using (private.owns_person(person_id)) with check (private.owns_person(person_id) and (status = 'withdrawn' or private.role_open_for_interest(role_requirement_id)));
create policy eoi_stakeholder_read on expressions_of_interest for select to authenticated
  using (status = 'shared' and (private.has_role('staffing_lead') or private.leads_opportunity(private.role_opportunity(role_requirement_id))));

-- Audit: admins read everything; people read what they did; verification history is visible to the evidence's owner, staffing leads and
-- the reviewer; export records are visible to the profile's owner. No API role can write, change or delete audit rows.
create policy audit_read on audit_log for select to authenticated using (
  private.is_admin()
  or actor_id = auth.uid()
  or (action like 'evidence.%' and subject_person_id is not null
      and (private.owns_person(subject_person_id) or private.has_role('staffing_lead') or private.is_reviewer_for_person(subject_person_id)))
  or (action = 'profile.export' and private.owns_person(subject_person_id))
);
