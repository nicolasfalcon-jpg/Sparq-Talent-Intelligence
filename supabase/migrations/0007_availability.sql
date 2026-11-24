-- 0007: availability and allocation conflicts are DERIVED, never stored.
--
-- 0001 had an `availability` table that was meant to be "maintained by application code or a job". A stored copy drifts from the
-- assignments it summarises, so it is not carried over: `public.person_availability(as_of)` computes it from confirmed assignments
-- and open proposals, as the caller (SECURITY INVOKER, so RLS decides which people and assignments the caller can see).
--
-- RULES
--  * Load at a date d = the sum of `allocation` of confirmed assignments whose window [starts_on, available_from) contains d.
--    An assignment with no end occupies the person indefinitely. The window is half-open: a person released on Jan 5 can start
--    something else on Jan 5 without a conflict.
--  * `available_from` = the earliest date d >= as_of where load(d) < 1.0. Candidate dates are as_of and every release date after
--    it, because load only drops at a release. Someone with no assignment, or with spare capacity today, is available now.
--    `free_capacity` = 1.0 - load(available_from), so a part-time engineer reports how much room they have.
--  * `status` = 'pending' while any assignment that is still holding the person at as_of and is released on or before
--    `available_from` has an end date nobody has confirmed (assignments.end_confirmed = false); otherwise 'confirmed'.
--  * `current_project`, its end and delivery lead come from the active assignment that releases the person last.
--  * `proposed_*` overlays the earliest kickoff among submitted or approved proposals that propose the person for a seat that has
--    NOT yet been confirmed as an assignment. A proposal is information, never an occupation: it does not change `available_from`.
--  * CONFLICTS. Confirming an assignment is refused when the peak load over its window would exceed 1.0 (0006,
--    private.assignment_capacity_guard), so part-time and overlapping engagements are accepted exactly as long as they fit.
--    A person proposed in several proposals at once is allowed; the overlay shows the earliest one and the planning screens can
--    list the rest.

create function public.person_availability(as_of date default current_date)
returns table (
  person_id uuid, available_from date, status public.availability_status, free_capacity numeric,
  current_project text, current_project_ends date, delivery_lead_id uuid,
  proposed_opportunity_id uuid, proposed_from date
)
language sql stable security invoker set search_path = '' as $$
  with cand as (
    select p.id as pid, as_of as d from public.people p
    union
    select a.person_id, a.available_from from public.assignments a where a.available_from > as_of
  ),
  loads as (
    select c.pid, c.d, coalesce((
      select sum(a.allocation) from public.assignments a
      where a.person_id = c.pid and a.starts_on <= c.d and c.d < coalesce(a.available_from, 'infinity'::date)
    ), 0) as load
    from cand c
  ),
  pick as (select distinct on (pid) pid, d, load from loads where load < 1 order by pid, d),
  active as (
    select a.* from public.assignments a
    where a.starts_on <= as_of and as_of < coalesce(a.available_from, 'infinity'::date)
  ),
  current_work as (
    select distinct on (person_id) person_id, project_name, ends_on, delivery_lead_id
    from active order by person_id, coalesce(available_from, 'infinity'::date) desc, allocation desc
  ),
  proposed as (
    select distinct on (s.person_id) s.person_id, tp.opportunity_id, o.kickoff
    from public.proposal_seats s
    join public.team_proposals tp on tp.id = s.proposal_id and tp.state in ('submitted', 'approved')
    join public.opportunities o on o.id = tp.opportunity_id
    where s.person_id is not null and not exists (select 1 from public.assignments a where a.proposal_seat_id = s.id)
    order by s.person_id, o.kickoff
  )
  select p.id, pk.d,
    case when exists (select 1 from active a where a.person_id = p.id and not a.end_confirmed and a.available_from <= pk.d)
         then 'pending'::public.availability_status else 'confirmed'::public.availability_status end,
    (1 - pk.load)::numeric,
    cw.project_name, cw.ends_on, cw.delivery_lead_id, pr.opportunity_id, pr.kickoff
  from public.people p
  left join pick pk on pk.pid = p.id
  left join current_work cw on cw.person_id = p.id
  left join proposed pr on pr.person_id = p.id
$$;

comment on function public.person_availability(date) is 'Derived availability and free capacity per person (see the rules at the top of migration 0007). SECURITY INVOKER: RLS applies.';
