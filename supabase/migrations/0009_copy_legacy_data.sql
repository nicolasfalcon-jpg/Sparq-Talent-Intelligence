-- 0009: carry the rows of the archived 0001 schema (legacy_0001) into the new schema, where that is safe.
--
-- Expected to copy NOTHING in practice (0001 was never populated by the app), but it must be correct if some environment did
-- load it. Rules:
--  * Never lose a row: legacy_0001 keeps everything, and this migration only reads from it.
--  * Fail loudly, not silently: conflicts are tolerated only on the primary key (so the migration can be re-run); a row that
--    violates a NEW constraint aborts the whole migration instead of being skipped.
--  * Never upgrade trust. Anything without a complete verification stamp becomes 'self_reported'; private stays private
--    (interests and preferences are copied as not shared); legacy slugs become `slug`, legacy rows keep their uuid where they had one.
--  * Not copied, on purpose: `availability` (derived now), `notifications` and `audit_log` (out of scope), and `assignments`
--    (a confirmed assignment must record the human who confirmed it, which 0001 never captured), and proposals that were
--    in_review / approved / changes_requested (no reviewer identity to attach a human review to). They stay in legacy_0001.
-- Runs as the migration owner, so triggers that constrain API roles do not apply and RLS is not in the way.

insert into public.capabilities (slug, name, grp, aliases)
select id, name, grp, aliases from legacy_0001.capabilities
on conflict (slug) do nothing;

insert into public.people (slug, name, headline, discipline, location, country, years_experience, at_sparq_since, languages, summary, top_skills, passport_groups, updated_at)
select id, name, headline, discipline, location, country, years_experience, at_sparq_since, languages, summary, top_skills, passport_groups, updated_at
from legacy_0001.people
on conflict (slug) do nothing;

-- Preferences were a column of `people`; they become a private-by-default row of their own.
insert into public.person_preferences (person_id, work_preferences, shared_with_staffing)
select p.id, l.work_preferences, false
from legacy_0001.people l join public.people p on p.slug = l.id
where l.work_preferences is not null and btrim(l.work_preferences) <> ''
on conflict (person_id) do nothing;

insert into public.app_users (id, display_name, title, person_id, created_at)
select u.id, u.display_name, u.title, p.id, u.created_at
from legacy_0001.app_users u left join public.people p on p.slug = u.person_id
on conflict (id) do nothing;

-- One role per legacy user, exactly as it was. Roles can only be granted by an administrator from now on.
insert into public.user_roles (user_id, role)
select id, role from legacy_0001.app_users
on conflict do nothing;

insert into public.skill_evidence (id, person_id, capability_id, label, source, detail, verification, verified_by, verified_at, created_at)
select e.id, p.id, c.id, e.label, e.level, e.detail,
  case when e.confirmed_by is not null and e.confirmed_at is not null then 'verified'::public.verification_status else 'self_reported'::public.verification_status end,
  case when e.confirmed_by is not null and e.confirmed_at is not null then e.confirmed_by end,
  case when e.confirmed_by is not null and e.confirmed_at is not null then e.confirmed_at end,
  e.created_at
from legacy_0001.skill_evidence e
join public.people p on p.slug = e.person_id
left join public.capabilities c on c.slug = e.capability_id
on conflict (id) do nothing;

-- 0001 had no confirmation timestamp for projects: the row's creation time is the closest honest stamp, and only when a reviewer was recorded.
insert into public.project_experience (id, person_id, period_label, client, client_category, role, title, summary, tags, highlights, verification, verified_by, verified_at, created_at)
select pe.id, p.id, pe.period, pe.client, pe.client_category, pe.role, pe.title, pe.summary, pe.tags, pe.highlights,
  case when pe.confirmed_by is not null then 'verified'::public.verification_status else 'self_reported'::public.verification_status end,
  pe.confirmed_by, case when pe.confirmed_by is not null then pe.created_at end, pe.created_at
from legacy_0001.project_experience pe join public.people p on p.slug = pe.person_id
on conflict (id) do nothing;

insert into public.certifications (id, person_id, name, issued_label)
select c.id, p.id, c.name, c.date_label from legacy_0001.certifications c join public.people p on p.slug = c.person_id
on conflict (id) do nothing;

-- Private by default: nothing is shared, whatever the legacy row said.
insert into public.career_interests (person_id, interest, selected, shared_with_staffing)
select p.id, i.interest, i.selected, false from legacy_0001.career_interests i join public.people p on p.slug = i.person_id
on conflict (person_id, interest) do nothing;

insert into public.opportunities (slug, client, client_initials, industry, name, short, description, status, kickoff, duration_months, capabilities, created_by, created_at)
select id, client, client_initials, industry, name, short, description, status, kickoff, duration_months, capabilities, created_by, created_at
from legacy_0001.opportunities
on conflict (slug) do nothing;

-- A requirement only says what is needed. A legacy `proposed_person_id` was a proposal, not a requirement, and is not carried over.
insert into public.role_requirements (slug, opportunity_id, title, capabilities, must_have, nice_to_have, seniority, allocation)
select r.id, o.id, r.title, r.capabilities, r.must_have, r.nice_to_have, r.seniority, coalesce(r.allocation_pct, 100) / 100.0
from legacy_0001.role_requirements r join public.opportunities o on o.slug = r.opportunity_id
on conflict (slug) do nothing;

-- Best effort only: link a delivery lead when exactly one existing delivery-lead user has that display name.
insert into public.opportunity_delivery_leads (opportunity_id, user_id)
select o.id, u.id
from legacy_0001.opportunities lo
join public.opportunities o on o.slug = lo.id
join public.app_users u on u.display_name = lo.delivery_lead
join public.user_roles ur on ur.user_id = u.id and ur.role = 'delivery_lead'
where (select count(*) from public.app_users u2 join public.user_roles ur2 on ur2.user_id = u2.id and ur2.role = 'delivery_lead' where u2.display_name = lo.delivery_lead) = 1
on conflict do nothing;

insert into public.shortlists (owner_id, person_id, added_at)
select s.owner_id, p.id, s.added_at from legacy_0001.shortlists s join public.people p on p.slug = s.person_id
on conflict do nothing;

-- Only drafts and withdrawn proposals: they need no reviewer. Seats carry over with their proposal; 0001's 'confirmed' seat state has no equivalent.
insert into public.team_proposals (id, opportunity_id, title, brief, state, created_by, created_at)
select tp.id, o.id, tp.title, tp.brief,
  case tp.status when 'withdrawn' then 'withdrawn'::public.proposal_state else 'draft'::public.proposal_state end,
  tp.created_by, tp.created_at
from legacy_0001.team_proposals tp left join public.opportunities o on o.slug = tp.opportunity_id
where tp.status in ('draft', 'withdrawn')
on conflict (id) do nothing;

insert into public.proposal_seats (id, proposal_id, title, capabilities, seniority, allocation, person_id, seat_state)
select s.id, s.proposal_id, s.role_title, s.capabilities, s.seniority, coalesce(s.allocation_pct, 100) / 100.0, p.id,
  case when p.id is not null then 'proposed'::public.seat_state else 'open'::public.seat_state end
from legacy_0001.proposal_seats s
join public.team_proposals tp on tp.id = s.proposal_id
left join public.people p on p.slug = s.person_id
on conflict (id) do nothing;

-- Expressions of interest: a legacy row that was not shared with staffing is carried over as withdrawn (invisible to stakeholders).
insert into public.expressions_of_interest (id, person_id, role_requirement_id, status, note, created_at)
select e.id, p.id, rr.id, case when e.shared_with_staffing then 'shared'::public.interest_status else 'withdrawn'::public.interest_status end, e.note, e.created_at
from legacy_0001.expressions_of_interest e
join public.people p on p.slug = e.person_id
join public.role_requirements rr on rr.slug = e.role_requirement_id
on conflict (id) do nothing;
