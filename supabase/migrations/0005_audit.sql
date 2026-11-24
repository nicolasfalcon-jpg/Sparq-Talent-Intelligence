-- 0005: audit foundation. Minimal on purpose: only the events the product needs to be accountable for.
--
--   evidence.request_verification | evidence.cancel_verification_request | evidence.verify | evidence.decline | evidence.revoke
--   permission.grant | permission.revoke | permission.link_profile | permission.assign_delivery_lead
--   proposal.submit | proposal.withdraw | proposal.review
--   assignment.confirm
--   profile.export
--
-- Every row identifies the ACTOR, the OPERATION, the affected RESOURCE and the TIME. Rows are written only by the SECURITY
-- DEFINER functions of 0006 (no API role has INSERT), and no API role can update, delete or truncate them (no grants, and a trigger
-- that refuses even if a grant is added by mistake). Assistant conversation storage, notification delivery and analytics are
-- deliberately not part of this migration.

create table audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid not null references app_users(id) on delete restrict,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  subject_type text not null check (subject_type ~ '^[a-z_]+$'),
  subject_id uuid not null,
  subject_person_id uuid references people(id) on delete set null,   -- the profile the event concerns, so its owner can read their own history
  details jsonb not null default '{}'
);
create index audit_log_subject_idx on audit_log (subject_type, subject_id, occurred_at);
create index audit_log_person_idx on audit_log (subject_person_id, occurred_at) where subject_person_id is not null;
create index audit_log_actor_idx on audit_log (actor_id, occurred_at);

-- Refuses any change made through an API role. (Trigger functions run with the INVOKER's rights, so the role test is inline: calling a helper
-- from here would force us to grant API roles access to the private schema.)
-- The owner role (migrations, the seed, a DBA doing a retention job) is not an API
-- role, and neither are the SECURITY DEFINER functions, which run as their owner.
create function private.deny_api_modification() returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated', 'service_role') then
    raise exception '% on % is not allowed: this table is append-only for application roles', tg_op, tg_table_name using errcode = '42501';
  end if;
  if tg_op = 'TRUNCATE' then return null; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger audit_log_immutable before update or delete on audit_log for each row execute function private.deny_api_modification();
create trigger audit_log_no_truncate before truncate on audit_log for each statement execute function private.deny_api_modification();
create trigger proposal_reviews_immutable before update or delete on proposal_reviews for each row execute function private.deny_api_modification();
create trigger proposal_reviews_no_truncate before truncate on proposal_reviews for each statement execute function private.deny_api_modification();
-- Privilege tables: belt and braces on top of "no grants" (a future grant, or the service role, still cannot edit them directly).
create trigger user_roles_privileged before insert or update or delete on user_roles for each row execute function private.deny_api_modification();
create trigger opportunity_delivery_leads_privileged before insert or update or delete on opportunity_delivery_leads for each row execute function private.deny_api_modification();
create trigger assignments_privileged before insert or update or delete on assignments for each row execute function private.deny_api_modification();
