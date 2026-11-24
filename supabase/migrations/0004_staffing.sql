-- 0004: opportunities, proposals, human review, assignments, availability inputs and expressions of interest.
--
-- FIVE DIFFERENT THINGS, FIVE DIFFERENT PLACES (a proposal never becomes an assignment by itself):
--   1. a person PROPOSED for a seat ........ proposal_seats.person_id (seat_state = 'proposed')
--   2. a SUBMITTED proposal ................ team_proposals.state = 'submitted' (the author handed it over for review)
--   3. a human REVIEW ...................... proposal_reviews (one immutable row per proposal version, by the opportunity's delivery lead)
--   4. an APPROVED proposal ................ team_proposals.state = 'approved' (a consequence of an approving review row, nothing more)
--   5. a CONFIRMED assignment .............. assignments (a separate, explicit act by the delivery lead, per seat, with a capacity check)
-- 0001 had `role_requirements.proposed_person_id` and a seat state 'confirmed'; both are gone: a requirement only says what is
-- needed, and "confirmed" is an assignment, not a flag on a proposal.

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  client text not null,
  client_initials text not null check (length(client_initials) between 1 and 3),
  industry text not null default '',
  name text not null,
  short text not null default '',
  description text not null default '',
  status opportunity_status not null default 'Upcoming',
  kickoff date not null,
  duration_months int not null check (duration_months > 0),
  capabilities text[] not null default '{}',
  created_by uuid references app_users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger opportunities_touch before update on opportunities for each row execute function private.touch_updated_at();

create table role_requirements (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  sort_order int not null default 0,
  title text not null,
  capabilities text[] not null default '{}',
  must_have text[] not null default '{}',
  nice_to_have text[] not null default '{}',
  seniority text,
  allocation numeric(4,3) not null default 1 check (allocation > 0 and allocation <= 1),  -- fraction of a full-time engagement
  created_at timestamptz not null default now()
);
create index role_requirements_opportunity_idx on role_requirements (opportunity_id, sort_order);

-- PROJECT-LEVEL AUTHORIZATION. Being a delivery lead is not enough to review or confirm anything: the administrator must assign
-- that user to the opportunity. Reviewing a proposal and confirming an assignment require this row (see 0006).
create table opportunity_delivery_leads (
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  granted_by uuid references app_users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (opportunity_id, user_id)
);

create table shortlists (
  owner_id uuid not null references app_users(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (owner_id, person_id)
);

-- ---------------------------------------------------------------------------------------------------------------------
-- Team proposals
--   draft ──submit──▶ submitted ──review: approved──────────▶ approved   (terminal)
--     │                  │ ├─────review: declined───────────▶ declined   (terminal)
--     │                  │ └─────review: changes_requested──▶ changes_requested ──resubmit (version + 1)──▶ submitted
--     └──withdraw─▶ withdrawn (from draft, submitted or changes_requested; terminal)
-- Enforced by a trigger for every role (private.proposal_guard); the transitions themselves are performed by functions.
-- ---------------------------------------------------------------------------------------------------------------------
create table team_proposals (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id) on delete restrict,   -- null only while it is a draft
  title text not null check (length(btrim(title)) > 0),
  brief text,
  state proposal_state not null default 'draft',
  version int not null default 1 check (version >= 1),                   -- +1 on every resubmission; one review per version
  note_for_reviewer text check (length(note_for_reviewer) <= 1000),
  created_by uuid not null references app_users(id) on delete restrict default auth.uid(),
  submitted_by uuid references app_users(id) on delete restrict,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposal_has_opportunity_once_submitted check (state in ('draft', 'withdrawn') or opportunity_id is not null),
  constraint proposal_submission_stamp check (state in ('draft', 'withdrawn') or (submitted_by is not null and submitted_at is not null))
);
create index team_proposals_opportunity_idx on team_proposals (opportunity_id, state);
create index team_proposals_creator_idx on team_proposals (created_by);
create trigger team_proposals_touch before update on team_proposals for each row execute function private.touch_updated_at();

create table proposal_seats (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references team_proposals(id) on delete cascade,
  role_requirement_id uuid references role_requirements(id) on delete set null,
  position int not null default 0,
  title text not null check (length(btrim(title)) > 0),
  capabilities text[] not null default '{}',
  seniority text,
  allocation numeric(4,3) not null default 1 check (allocation > 0 and allocation <= 1),
  person_id uuid references people(id) on delete restrict,
  seat_state seat_state not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposal_seat_state_matches_person check ((seat_state = 'proposed') = (person_id is not null))
);
create index proposal_seats_proposal_idx on proposal_seats (proposal_id, position);
create index proposal_seats_person_idx on proposal_seats (person_id) where person_id is not null;
-- One seat per person inside a proposal. Competing proposals for the same person are allowed (conflicts are computed).
create unique index proposal_seats_one_per_person on proposal_seats (proposal_id, person_id) where person_id is not null;
create trigger proposal_seats_touch before update on proposal_seats for each row execute function private.touch_updated_at();

-- The human review. Immutable: the decision and its explanation are a record, not a field to edit later.
create table proposal_reviews (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references team_proposals(id) on delete restrict,
  proposal_version int not null,
  reviewer_id uuid not null references app_users(id) on delete restrict,
  decision review_decision not null,
  note text check (length(note) <= 2000),
  created_at timestamptz not null default now(),
  unique (proposal_id, proposal_version),
  constraint review_explains_a_return check (decision = 'approved' or length(btrim(coalesce(note, ''))) > 0)
);

-- ---------------------------------------------------------------------------------------------------------------------
-- Confirmed assignments and allocation
-- ---------------------------------------------------------------------------------------------------------------------
-- `allocation` is a fraction of a full-time engagement (0.5 = half time), so part-time and overlapping work is modelled
-- directly. The occupancy window of an assignment is [starts_on, available_from): the person is occupied until they are
-- released, which can be later than the project's last day (`ends_on`). Open-ended work has both end columns null.
-- There is NO exclusion constraint on overlap, because overlapping part-time assignments are legitimate. What must hold is
-- that the SUM of overlapping allocations never exceeds 1.0; private.assignment_capacity_guard (0006) enforces that.
create table assignments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete restrict,
  opportunity_id uuid references opportunities(id) on delete restrict,          -- null for work that is not a modelled opportunity
  proposal_seat_id uuid unique references proposal_seats(id) on delete restrict, -- provenance: the reviewed seat it came from
  project_name text not null check (length(btrim(project_name)) > 0),
  starts_on date not null,
  ends_on date,                                                                  -- last day of the project (shown as "until …")
  available_from date,                                                           -- first day the person can be planned elsewhere
  allocation numeric(4,3) not null default 1 check (allocation > 0 and allocation <= 1),
  end_confirmed boolean not null default false,                                  -- false = the end date is still pending confirmation
  delivery_lead_id uuid not null references app_users(id) on delete restrict,
  confirmed_by uuid not null references app_users(id) on delete restrict,        -- every assignment records the human who confirmed it
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignment_dates check (ends_on is null or ends_on >= starts_on),
  constraint assignment_release check ((ends_on is null) = (available_from is null) and (available_from is null or available_from > ends_on))
);
create index assignments_person_idx on assignments (person_id, starts_on);
create index assignments_lead_idx on assignments (delivery_lead_id);
create trigger assignments_touch before update on assignments for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------------------------------------------------
-- Expression of interest in a SPECIFIC opportunity role: a separate concept from private career interests. A row exists only
-- because the person chose to express interest; stakeholders see it while it is 'shared', and withdrawing hides it at once.
-- ---------------------------------------------------------------------------------------------------------------------
create table expressions_of_interest (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  role_requirement_id uuid not null references role_requirements(id) on delete cascade,
  status interest_status not null default 'shared',
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  unique (person_id, role_requirement_id),
  constraint eoi_withdrawn_stamp check ((status = 'withdrawn') = (withdrawn_at is not null))
);
create index expressions_of_interest_role_idx on expressions_of_interest (role_requirement_id);

create function private.eoi_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'withdrawn' then new.withdrawn_at := coalesce(new.withdrawn_at, now()); else new.withdrawn_at := null; end if;
  return new;
end $$;
create trigger eoi_guard before insert or update on expressions_of_interest for each row execute function private.eoi_guard();
