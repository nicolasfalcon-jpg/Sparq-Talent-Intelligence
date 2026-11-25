-- 0011: per-user daily usage limit for Ask Sparq (the Claude gateway). Additive.
--
-- The limit is enforced server-side with the CALLER's own JWT, so there is no service-role path and no shared counter:
-- `consume_assistant_quota(limit)` counts a call for auth.uid() for today (UTC) and says whether it is allowed.
-- The table has RLS and NO grant and NO policy: API roles cannot read, write or reset it, only this function can.
-- The increment is a single atomic upsert (row lock), so concurrent requests can never exceed the limit.

create table public.assistant_usage (
  user_id uuid not null references public.app_users(id) on delete cascade,
  day date not null,
  calls int not null default 0 check (calls >= 0),
  primary key (user_id, day)
);
alter table public.assistant_usage enable row level security;
revoke all on public.assistant_usage from public, anon, authenticated, service_role;

create function public.consume_assistant_quota(p_limit int)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := private.require_actor(); v_day date := (now() at time zone 'utc')::date; v_calls int;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then raise exception 'the daily limit must be between 1 and 1000' using errcode = '22023'; end if;
  insert into public.assistant_usage as u (user_id, day, calls) values (v_actor, v_day, 1)
    on conflict (user_id, day) do update set calls = u.calls + 1 where u.calls < p_limit
    returning u.calls into v_calls;
  return v_calls is not null;   -- null: the row was already at the limit and was not incremented
end $$;
revoke all on function public.consume_assistant_quota(int) from public, anon, authenticated, service_role;
grant execute on function public.consume_assistant_quota(int) to authenticated;
