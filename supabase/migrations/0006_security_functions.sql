-- 0006: authorization helpers, integrity triggers and the privileged operations.
--
-- HARDENING RULES FOR EVERYTHING IN THIS FILE
--  * SECURITY DEFINER functions set `search_path = ''` and schema-qualify every object, so nothing can be hijacked through a
--    user-controlled search path or a shadowing object in `pg_temp`.
--  * EXECUTE is revoked from PUBLIC, `anon` and `service_role` and granted to `authenticated` only where needed (all grants live in
--    0008, the last security migration). No privileged function is callable anonymously, and none takes an actor argument: the
--    actor is always `auth.uid()`.
--  * Trigger functions run with the INVOKER's rights and test `current_user` inline: 'anon', 'authenticated' and 'service_role' are
--    API roles and are constrained; the owner role (migrations, seed, the SECURITY DEFINER functions below) is not.
--  * Every privileged function checks its actor explicitly (role AND relationship), validates its input, locks the row it
--    changes, performs one narrow change, and writes an audit row. None runs dynamic SQL.
--  * Helpers used by RLS policies live in `private` (not exposed through the API) and only read; they run as their owner so
--    that a policy can consult other tables without recursion.
--  * Roles come from `user_roles`, never from a JWT claim. Admin is an administrative role: it does NOT verify evidence, review
--    proposals or confirm assignments.

-- ---------------------------------------------------------------------------------------------------------------------
-- Helpers (read-only, used by policies)
-- ---------------------------------------------------------------------------------------------------------------------
create function private.has_role(p_role public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = p_role)
$$;

create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_role('admin')
$$;

create function private.current_person_id() returns uuid language sql stable security definer set search_path = '' as $$
  select person_id from public.app_users where id = auth.uid()
$$;

-- NEVER returns NULL. A user without a linked profile has a NULL current_person_id(), and `x = NULL` is NULL, not false. In PL/pgSQL an
-- `if` on a NULL condition does not fire, so a denial check written with the negation operator (NOT applied to this helper) would silently
-- let that user through. A test caught exactly this: staff, a delivery lead and an administrator could request verification of someone
-- else's evidence. The fix is twofold: this helper is total, and every denial check below is written as `<helper> is not true`.
create function private.owns_person(p_person uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p_person = private.current_person_id(), false)
$$;

-- A delivery lead leads an opportunity only if the role AND an explicit assignment to that opportunity both exist.
create function private.leads_opportunity(p_opportunity uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select p_opportunity is not null
     and private.has_role('delivery_lead')
     and exists (select 1 from public.opportunity_delivery_leads where opportunity_id = p_opportunity and user_id = auth.uid())
$$;

-- A delivery lead may review the evidence of a person only through a working relationship: they lead an assignment of that
-- person, or that person is proposed in a submitted-or-later proposal for an opportunity they lead. Never merely by role.
create function private.is_reviewer_for_person(p_person uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select p_person is not null and private.has_role('delivery_lead') and (
    exists (select 1 from public.assignments a where a.person_id = p_person and a.delivery_lead_id = auth.uid())
    or exists (
      select 1 from public.proposal_seats s
      join public.team_proposals tp on tp.id = s.proposal_id
      where s.person_id = p_person and tp.state <> 'draft' and private.leads_opportunity(tp.opportunity_id)
    )
  )
$$;

-- Who may read a professional profile (people, evidence, experience, certifications, journey).
create function private.can_read_profile(p_person uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_role('staffing_lead') or private.owns_person(p_person) or private.is_reviewer_for_person(p_person)
$$;

create function private.can_see_opportunity(p_opportunity uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_role('staffing_lead') or private.is_admin() or private.leads_opportunity(p_opportunity)
$$;

create function private.owns_opportunity(p_opportunity uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_role('staffing_lead') and exists (select 1 from public.opportunities where id = p_opportunity and created_by = auth.uid())
$$;

create function private.role_opportunity(p_role uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select opportunity_id from public.role_requirements where id = p_role
$$;

create function private.role_open_for_interest(p_role uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.role_requirements rr join public.opportunities o on o.id = rr.opportunity_id
                 where rr.id = p_role and o.status in ('Staffing', 'Open'))
$$;

-- Proposals: drafts are private to their author; once submitted, staffing leads and the opportunity's delivery lead can see them.
create function private.can_see_proposal(p_proposal uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_proposals tp where tp.id = p_proposal and (
      tp.created_by = auth.uid()
      or (tp.state <> 'draft' and (private.has_role('staffing_lead') or private.leads_opportunity(tp.opportunity_id)))
    )
  )
$$;

create function private.can_edit_proposal(p_proposal uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_proposals tp
    where tp.id = p_proposal and tp.created_by = auth.uid() and private.has_role('staffing_lead') and tp.state in ('draft', 'changes_requested')
  )
$$;

create function private.require_actor() returns uuid language plpgsql stable set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'authentication required' using errcode = '28000'; end if;
  return v;
end $$;

create function private.write_audit(p_actor uuid, p_action text, p_subject_type text, p_subject_id uuid, p_person uuid, p_details jsonb)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, subject_type, subject_id, subject_person_id, details)
  values (p_actor, p_action, p_subject_type, p_subject_id, p_person, coalesce(p_details, '{}'::jsonb))
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------------------------------------------------

-- Evidence and experience. API roles can create SELF-REPORTED rows, withdraw unverified ones, and nothing else: verification
-- metadata can neither be forged on insert nor changed on update, and a verified row is read-only and undeletable. The only
-- way to change verification is the functions below, which run as the owner (not an API role) and are therefore not blocked.
create function private.evidence_guard() returns trigger language plpgsql set search_path = '' as $$
declare stamp text[] := array['verification', 'verified_by', 'verified_at', 'verification_note', 'updated_at'];
begin
  if not (current_user in ('anon', 'authenticated', 'service_role')) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' then
    if new.verification <> 'self_reported' or new.verified_by is not null or new.verified_at is not null or new.verification_note is not null then
      raise exception 'new evidence must be self-reported and carry no verification metadata' using errcode = '42501';
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.verification = 'verified' then
      raise exception 'verified evidence cannot be removed; ask a reviewer to correct it' using errcode = '42501';
    end if;
    return old;
  end if;
  -- UPDATE
  if old.verification = 'verified' then
    raise exception 'verified evidence is read-only; ask a reviewer to correct it' using errcode = '42501';
  end if;
  if new.verification is distinct from old.verification or new.verified_by is distinct from old.verified_by
     or new.verified_at is distinct from old.verified_at or new.verification_note is distinct from old.verification_note then
    raise exception 'verification can only change through the verification functions' using errcode = '42501';
  end if;
  -- Editing the content of a claim that is awaiting review withdraws the request: the reviewer must not approve what changed.
  if old.verification = 'pending' and (to_jsonb(new) - stamp) is distinct from (to_jsonb(old) - stamp) then
    new.verification := 'self_reported';
  end if;
  return new;
end $$;
create trigger skill_evidence_guard before insert or update or delete on skill_evidence for each row execute function private.evidence_guard();
create trigger project_experience_guard before insert or update or delete on project_experience for each row execute function private.evidence_guard();

-- Identity: nobody edits their own id, profile link or creation time through the API (column grants already forbid it).
create function private.app_user_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated', 'service_role') and (new.id is distinct from old.id or new.person_id is distinct from old.person_id or new.created_at is distinct from old.created_at) then
    raise exception 'identity fields cannot be changed through the API' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger app_users_guard before update on app_users for each row execute function private.app_user_guard();

-- Proposal lifecycle. Valid transitions are enforced for EVERY role; direct edits of state and stamps are refused for API roles.
create function private.proposal_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.state is distinct from old.state then
    if (old.state::text || '>' || new.state::text) <> all (array[
      'draft>submitted', 'draft>withdrawn', 'submitted>approved', 'submitted>declined', 'submitted>changes_requested',
      'submitted>withdrawn', 'changes_requested>submitted', 'changes_requested>withdrawn'
    ]) then
      raise exception 'invalid proposal transition % -> %', old.state, new.state using errcode = '23514';
    end if;
    if old.state = 'changes_requested' and new.state = 'submitted' and new.version <> old.version + 1 then
      raise exception 'a resubmission must increase the proposal version' using errcode = '23514';
    end if;
  end if;
  if current_user in ('anon', 'authenticated', 'service_role') then
    if new.state is distinct from old.state or new.version is distinct from old.version or new.created_by is distinct from old.created_by
       or new.submitted_by is distinct from old.submitted_by or new.submitted_at is distinct from old.submitted_at then
      raise exception 'proposal state, version and submission stamps change only through the proposal functions' using errcode = '42501';
    end if;
    if old.state not in ('draft', 'changes_requested') then
      raise exception 'a % proposal can no longer be edited', old.state using errcode = '42501';
    end if;
  end if;
  if new.opportunity_id is distinct from old.opportunity_id
     and exists (select 1 from public.proposal_seats where proposal_id = new.id and role_requirement_id is not null) then
    raise exception 'clear the seats'' role links before moving a proposal to another opportunity' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger team_proposals_guard before update on team_proposals for each row execute function private.proposal_guard();

-- A proposal can be deleted only while it is a draft (and only by API roles that the policy allows).
create function private.proposal_delete_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated', 'service_role') and old.state <> 'draft' then
    raise exception 'only a draft proposal can be deleted' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger team_proposals_delete_guard before delete on team_proposals for each row execute function private.proposal_delete_guard();

-- Seats: editable only while the proposal is (API roles), and a seat's role requirement must belong to the proposal's opportunity.
create function private.proposal_seat_guard() returns trigger language plpgsql set search_path = '' as $$
declare v_state public.proposal_state; v_opp uuid; v_role_opp uuid;
begin
  select state, opportunity_id into v_state, v_opp from public.team_proposals where id = case when tg_op = 'DELETE' then old.proposal_id else new.proposal_id end;
  if current_user in ('anon', 'authenticated', 'service_role') and v_state not in ('draft', 'changes_requested') then
    raise exception 'a % proposal can no longer be edited', v_state using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' then
    if new.role_requirement_id is not null then
      select opportunity_id into v_role_opp from public.role_requirements where id = new.role_requirement_id;
      if v_opp is null or v_role_opp is distinct from v_opp then
        raise exception 'the seat''s role requirement does not belong to the proposal''s opportunity' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;
  return old;
end $$;
create trigger proposal_seats_guard before insert or update or delete on proposal_seats for each row execute function private.proposal_seat_guard();

-- Allocation. Overlapping assignments are fine as long as, at every moment, the person's total allocation is at most 1.0.
-- Load only rises where an assignment starts, so it is enough to test the new assignment's own start and every other start
-- inside its window. Serialized per person so two concurrent confirmations cannot both pass.
create function private.assignment_capacity_guard() returns trigger language plpgsql set search_path = '' as $$
declare v_peak numeric; v_end date := coalesce(new.available_from, 'infinity'::date);
begin
  -- An out-of-range allocation is the CHECK constraint's to report (BEFORE triggers run first, so without this the message would mislead).
  if new.allocation is null or new.allocation <= 0 or new.allocation > 1 then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('assignment-capacity:' || new.person_id::text, 0));
  select coalesce(max(point_load), 0) into v_peak from (
    select new.allocation + coalesce((
      select sum(a.allocation) from public.assignments a
      where a.person_id = new.person_id and a.id is distinct from new.id
        and a.starts_on <= p.d and p.d < coalesce(a.available_from, 'infinity'::date)
    ), 0) as point_load
    from (
      select new.starts_on as d
      union
      select a.starts_on from public.assignments a
      where a.person_id = new.person_id and a.id is distinct from new.id and a.starts_on > new.starts_on and a.starts_on < v_end
    ) p
  ) loads;
  if v_peak > 1.0 then
    raise exception 'assignment exceeds the person''s capacity (peak allocation %)', v_peak using errcode = '23514';
  end if;
  return new;
end $$;
create trigger assignments_capacity before insert or update of person_id, starts_on, available_from, allocation on assignments for each row execute function private.assignment_capacity_guard();

-- ---------------------------------------------------------------------------------------------------------------------
-- Privileged operations (RPC). Each is the ONLY way to make its change.
-- ---------------------------------------------------------------------------------------------------------------------

-- The owner asks for confirmation of their own claim (self_reported -> pending), or withdraws the request (pending -> self_reported).
create function public.request_evidence_verification(p_kind text, p_id uuid, p_requested boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := private.require_actor(); v_person uuid; v_status public.verification_status; v_label text; v_to public.verification_status;
begin
  if p_kind = 'skill' then
    select person_id, verification, label into v_person, v_status, v_label from public.skill_evidence where id = p_id for update;
  elsif p_kind = 'project' then
    select person_id, verification, title into v_person, v_status, v_label from public.project_experience where id = p_id for update;
  else
    raise exception 'unknown evidence kind' using errcode = '22023';
  end if;
  if not found then raise exception 'evidence not found' using errcode = 'P0002'; end if;
  if private.owns_person(v_person) is not true then raise exception 'only the owner can request verification of their evidence' using errcode = '42501'; end if;
  if p_requested and v_status = 'self_reported' then v_to := 'pending';
  elsif not p_requested and v_status = 'pending' then v_to := 'self_reported';
  else raise exception 'cannot % verification of % evidence', case when p_requested then 'request' else 'cancel the request for' end, v_status using errcode = '55000';
  end if;
  if p_kind = 'skill' then update public.skill_evidence set verification = v_to where id = p_id;
  else update public.project_experience set verification = v_to where id = p_id; end if;
  perform private.write_audit(v_actor, case when p_requested then 'evidence.request_verification' else 'evidence.cancel_verification_request' end,
    case p_kind when 'skill' then 'skill_evidence' else 'project_experience' end, p_id, v_person,
    jsonb_build_object('label', v_label, 'from', v_status, 'to', v_to));
end $$;

-- A reviewer verifies, declines or revokes. Reviewer = delivery lead with a working relationship to the person (never the person
-- themselves). Declining and revoking require a written reason. Revoking returns the row to self-reported, never to pending.
create function public.decide_evidence_verification(p_kind text, p_id uuid, p_decision text, p_note text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid := private.require_actor(); v_person uuid; v_status public.verification_status; v_label text;
  v_to public.verification_status; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_kind = 'skill' then
    select person_id, verification, label into v_person, v_status, v_label from public.skill_evidence where id = p_id for update;
  elsif p_kind = 'project' then
    select person_id, verification, title into v_person, v_status, v_label from public.project_experience where id = p_id for update;
  else
    raise exception 'unknown evidence kind' using errcode = '22023';
  end if;
  if not found then raise exception 'evidence not found' using errcode = 'P0002'; end if;
  if private.is_reviewer_for_person(v_person) is not true then raise exception 'you are not an authorized reviewer for this person' using errcode = '42501'; end if;
  if private.owns_person(v_person) then raise exception 'you cannot decide on your own evidence' using errcode = '42501'; end if;

  if p_decision = 'verify' and v_status in ('self_reported', 'pending') then v_to := 'verified';
  elsif p_decision = 'decline' and v_status = 'pending' then v_to := 'self_reported';
  elsif p_decision = 'revoke' and v_status = 'verified' then v_to := 'self_reported';
  elsif p_decision in ('verify', 'decline', 'revoke') then raise exception 'cannot % evidence that is %', p_decision, v_status using errcode = '55000';
  else raise exception 'unknown decision' using errcode = '22023';
  end if;
  if p_decision in ('decline', 'revoke') and v_note is null then raise exception 'a written reason is required to % evidence', p_decision using errcode = '22023'; end if;

  if p_kind = 'skill' then
    update public.skill_evidence set verification = v_to,
      verified_by = case when v_to = 'verified' then v_actor end, verified_at = case when v_to = 'verified' then now() end,
      verification_note = case when v_to = 'verified' then v_note end where id = p_id;
  else
    update public.project_experience set verification = v_to,
      verified_by = case when v_to = 'verified' then v_actor end, verified_at = case when v_to = 'verified' then now() end,
      verification_note = case when v_to = 'verified' then v_note end where id = p_id;
  end if;
  perform private.write_audit(v_actor, 'evidence.' || p_decision, case p_kind when 'skill' then 'skill_evidence' else 'project_experience' end, p_id, v_person,
    jsonb_build_object('label', v_label, 'from', v_status, 'to', v_to, 'note', v_note));
end $$;

-- Author hands a proposal over for review (draft -> submitted, or changes_requested -> submitted with version + 1).
create function public.submit_proposal(p_id uuid, p_note text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := private.require_actor(); v public.team_proposals%rowtype;
begin
  select * into v from public.team_proposals where id = p_id for update;
  if not found then raise exception 'proposal not found' using errcode = 'P0002'; end if;
  if v.created_by <> v_actor or private.has_role('staffing_lead') is not true then raise exception 'only the staffing lead who wrote a proposal can submit it' using errcode = '42501'; end if;
  if v.state not in ('draft', 'changes_requested') then raise exception 'a % proposal cannot be submitted', v.state using errcode = '55000'; end if;
  if v.opportunity_id is null then raise exception 'choose an opportunity before submitting' using errcode = '23514'; end if;
  if not exists (select 1 from public.proposal_seats where proposal_id = p_id) then raise exception 'a proposal needs at least one seat' using errcode = '23514'; end if;
  update public.team_proposals set state = 'submitted', version = case when v.state = 'changes_requested' then v.version + 1 else v.version end,
    submitted_by = v_actor, submitted_at = now(), note_for_reviewer = coalesce(p_note, v.note_for_reviewer) where id = p_id;
  perform private.write_audit(v_actor, 'proposal.submit', 'team_proposal', p_id, null, jsonb_build_object('opportunity_id', v.opportunity_id, 'from', v.state, 'version', case when v.state = 'changes_requested' then v.version + 1 else v.version end));
end $$;

create function public.withdraw_proposal(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := private.require_actor(); v public.team_proposals%rowtype;
begin
  select * into v from public.team_proposals where id = p_id for update;
  if not found then raise exception 'proposal not found' using errcode = 'P0002'; end if;
  if v.created_by <> v_actor then raise exception 'only the author can withdraw a proposal' using errcode = '42501'; end if;
  if v.state not in ('draft', 'submitted', 'changes_requested') then raise exception 'a % proposal cannot be withdrawn', v.state using errcode = '55000'; end if;
  update public.team_proposals set state = 'withdrawn' where id = p_id;
  perform private.write_audit(v_actor, 'proposal.withdraw', 'team_proposal', p_id, null, jsonb_build_object('from', v.state));
end $$;

-- THE human review. Only the delivery lead assigned to the opportunity, never the author. Approving does NOT create an assignment.
create function public.review_proposal(p_id uuid, p_decision public.review_decision, p_note text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := private.require_actor(); v public.team_proposals%rowtype; v_review uuid;
begin
  select * into v from public.team_proposals where id = p_id for update;
  if not found then raise exception 'proposal not found' using errcode = 'P0002'; end if;
  if private.leads_opportunity(v.opportunity_id) is not true then raise exception 'only the delivery lead assigned to this opportunity can review its proposals' using errcode = '42501'; end if;
  if v.created_by = v_actor then raise exception 'you cannot review your own proposal' using errcode = '42501'; end if;
  if v.state <> 'submitted' then raise exception 'only a submitted proposal can be reviewed (it is %)', v.state using errcode = '55000'; end if;
  insert into public.proposal_reviews (proposal_id, proposal_version, reviewer_id, decision, note) values (p_id, v.version, v_actor, p_decision, nullif(btrim(coalesce(p_note, '')), ''))
    returning id into v_review;
  update public.team_proposals set state = case p_decision when 'approved' then 'approved'::public.proposal_state when 'declined' then 'declined'::public.proposal_state else 'changes_requested'::public.proposal_state end where id = p_id;
  perform private.write_audit(v_actor, 'proposal.review', 'team_proposal', p_id, null, jsonb_build_object('decision', p_decision, 'version', v.version, 'review_id', v_review));
  return v_review;
end $$;

-- Confirming ONE seat of an APPROVED proposal into a real assignment. The explicit second human act after approval.
create function public.confirm_assignment(p_seat_id uuid, p_starts_on date, p_ends_on date default null, p_available_from date default null, p_allocation numeric default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid := private.require_actor(); v_seat public.proposal_seats%rowtype; v_state public.proposal_state;
  v_opp uuid; v_client text; v_assignment uuid;
begin
  select s.* into v_seat from public.proposal_seats s where s.id = p_seat_id for update;
  if not found then raise exception 'seat not found' using errcode = 'P0002'; end if;
  select tp.state, tp.opportunity_id into v_state, v_opp from public.team_proposals tp where tp.id = v_seat.proposal_id for update;
  if private.leads_opportunity(v_opp) is not true then raise exception 'only the delivery lead assigned to this opportunity can confirm assignments' using errcode = '42501'; end if;
  if v_state <> 'approved' then raise exception 'only seats of an approved proposal can be confirmed (it is %)', v_state using errcode = '55000'; end if;
  if v_seat.person_id is null then raise exception 'this seat has no proposed person' using errcode = '23514'; end if;
  if private.owns_person(v_seat.person_id) then raise exception 'you cannot confirm your own assignment' using errcode = '42501'; end if;
  if exists (select 1 from public.assignments where proposal_seat_id = p_seat_id) then raise exception 'this seat is already confirmed' using errcode = '23505'; end if;
  if p_starts_on is null then raise exception 'a start date is required' using errcode = '22004'; end if;
  select client into v_client from public.opportunities where id = v_opp;
  insert into public.assignments (person_id, opportunity_id, proposal_seat_id, project_name, starts_on, ends_on, available_from, allocation, end_confirmed, delivery_lead_id, confirmed_by)
  values (v_seat.person_id, v_opp, p_seat_id, v_client, p_starts_on, p_ends_on, p_available_from, coalesce(p_allocation, v_seat.allocation), false, v_actor, v_actor)
  returning id into v_assignment;
  perform private.write_audit(v_actor, 'assignment.confirm', 'assignment', v_assignment, v_seat.person_id,
    jsonb_build_object('seat_id', p_seat_id, 'proposal_id', v_seat.proposal_id, 'opportunity_id', v_opp, 'allocation', coalesce(p_allocation, v_seat.allocation)));
  return v_assignment;
end $$;

-- Records that a passport was exported (who, which profile, format, anonymized or not). The owner can read these rows.
create function public.record_profile_export(p_person uuid, p_format text, p_anonymized boolean default false)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := private.require_actor();
begin
  if p_format not in ('pdf', 'docx', 'one_page') then raise exception 'unknown export format' using errcode = '22023'; end if;
  if not exists (select 1 from public.people where id = p_person) then raise exception 'profile not found' using errcode = 'P0002'; end if;
  if private.can_read_profile(p_person) is not true then raise exception 'you cannot export this profile' using errcode = '42501'; end if;
  perform private.write_audit(v_actor, 'profile.export', 'person', p_person, p_person,
    jsonb_build_object('format', p_format, 'anonymized', coalesce(p_anonymized, false), 'by_owner', private.owns_person(p_person)));
end $$;

-- Administration. An administrator manages roles and links but cannot touch their OWN (no self-escalation), and administrators
-- gain no review or confirmation powers from the role alone.
create function public.grant_user_role(p_user uuid, p_role public.app_role)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := private.require_actor();
begin
  if private.is_admin() is not true then raise exception 'administrators only' using errcode = '42501'; end if;
  if p_user = v_actor then raise exception 'administrators cannot change their own roles' using errcode = '42501'; end if;
  if not exists (select 1 from public.app_users where id = p_user) then raise exception 'user not found' using errcode = 'P0002'; end if;
  insert into public.user_roles (user_id, role, granted_by) values (p_user, p_role, v_actor) on conflict do nothing;
  if found then perform private.write_audit(v_actor, 'permission.grant', 'app_user', p_user, null, jsonb_build_object('role', p_role)); end if;
end $$;

create function public.revoke_user_role(p_user uuid, p_role public.app_role)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := private.require_actor();
begin
  if private.is_admin() is not true then raise exception 'administrators only' using errcode = '42501'; end if;
  if p_user = v_actor then raise exception 'administrators cannot change their own roles' using errcode = '42501'; end if;
  if p_role = 'admin' and (select count(*) from public.user_roles where role = 'admin') <= 1 then raise exception 'the last administrator cannot be removed' using errcode = '55000'; end if;
  delete from public.user_roles where user_id = p_user and role = p_role;
  if found then
    -- A delivery lead without the role must not keep project-level reviewer assignments.
    if p_role = 'delivery_lead' then delete from public.opportunity_delivery_leads where user_id = p_user; end if;
    perform private.write_audit(v_actor, 'permission.revoke', 'app_user', p_user, null, jsonb_build_object('role', p_role));
  end if;
end $$;

create function public.link_user_profile(p_user uuid, p_person uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := private.require_actor(); v_before uuid;
begin
  if private.is_admin() is not true then raise exception 'administrators only' using errcode = '42501'; end if;
  if p_user = v_actor then raise exception 'administrators cannot link their own profile' using errcode = '42501'; end if;
  select person_id into v_before from public.app_users where id = p_user for update;
  if not found then raise exception 'user not found' using errcode = 'P0002'; end if;
  update public.app_users set person_id = p_person where id = p_user;
  perform private.write_audit(v_actor, 'permission.link_profile', 'app_user', p_user, p_person, jsonb_build_object('from', v_before, 'to', p_person));
end $$;

create function public.assign_delivery_lead(p_opportunity uuid, p_user uuid, p_assigned boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := private.require_actor();
begin
  if private.is_admin() is not true then raise exception 'administrators only' using errcode = '42501'; end if;
  if p_user = v_actor then raise exception 'administrators cannot assign themselves as reviewers' using errcode = '42501'; end if;
  if not exists (select 1 from public.opportunities where id = p_opportunity) then raise exception 'opportunity not found' using errcode = 'P0002'; end if;
  if p_assigned then
    if not exists (select 1 from public.user_roles where user_id = p_user and role = 'delivery_lead') then raise exception 'the user is not a delivery lead' using errcode = '23514'; end if;
    insert into public.opportunity_delivery_leads (opportunity_id, user_id, granted_by) values (p_opportunity, p_user, v_actor) on conflict do nothing;
  else
    delete from public.opportunity_delivery_leads where opportunity_id = p_opportunity and user_id = p_user;
  end if;
  if found then perform private.write_audit(v_actor, 'permission.assign_delivery_lead', 'opportunity', p_opportunity, null, jsonb_build_object('user_id', p_user, 'assigned', p_assigned)); end if;
end $$;

-- The caller's own identity. Needed because `person_id` is deliberately not selectable on app_users.
create function public.my_identity() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'user_id', u.id, 'display_name', u.display_name, 'person_id', u.person_id,
    'roles', coalesce((select jsonb_agg(r.role order by r.role) from public.user_roles r where r.user_id = u.id), '[]'::jsonb))
  from public.app_users u where u.id = auth.uid()
$$;
