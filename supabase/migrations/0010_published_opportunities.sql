-- 0010: engineers can read PUBLISHED opportunities (My Space). Additive: 0001-0009 are not edited.
--
-- 0008 deliberately gave engineers no access to opportunities (so proposals could not leak through role requirements) and
-- left "which opportunities may an engineer see?" to the My Space design. The decision is:
--   * an opportunity is PUBLISHED to engineers while its status is 'Open' (Staffing and Upcoming are not: a Staffing opportunity
--     has a proposal in review, an Upcoming one is not open to interest yet);
--   * an engineer also keeps sight of an opportunity they have SHARED interest in (their own expression of interest), whatever its
--     status later becomes, so "Interests you've shared" can always be explained;
--   * what an engineer reads is the opportunity row and its role requirements, nothing else. role_requirements carries no person
--     column, proposals / seats / reviews / assignments / delivery-lead assignments remain unreadable to engineers (their
--     policies are unchanged), and the delivery lead's name stays hidden (opportunity_delivery_leads is not readable by engineers).
-- Staffing leads, delivery leads and admins are unaffected: policies are permissive (OR), these two only ADD a path for engineers.

-- Helper: may the CALLER, as an engineer, read this opportunity because it is published or because they shared interest in it?
create function private.can_see_published_opportunity(p_opportunity uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.has_role('engineer') and (
      exists (select 1 from public.opportunities o where o.id = p_opportunity and o.status = 'Open')
      or exists (select 1 from public.expressions_of_interest e join public.role_requirements rr on rr.id = e.role_requirement_id
                 where rr.opportunity_id = p_opportunity and e.status = 'shared' and e.person_id = private.current_person_id())
    ), false)
$$;
revoke all on function private.can_see_published_opportunity(uuid) from public, anon, authenticated, service_role;
grant execute on function private.can_see_published_opportunity(uuid) to authenticated;

create policy opportunities_read_published on opportunities for select to authenticated using (private.can_see_published_opportunity(id));
create policy roles_read_published on role_requirements for select to authenticated using (private.can_see_published_opportunity(opportunity_id));
