-- migrate:up

create table crm.person (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  full_name text,
  preferred_language text,
  city text,
  state text,
  notes text,
  ndnc_status text not null default 'unknown' check (ndnc_status in ('clear', 'listed', 'unknown')),
  ndnc_checked_at timestamptz,
  erased_at timestamptz,               -- DPDP erasure marker (Day 7)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- NO phone/email columns here. They live in person_identifier.
create trigger person_updated_at before update on crm.person
  for each row execute function crm.set_updated_at();
select crm.enable_tenant_rls('crm.person');

create table crm.person_identifier (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  person_id uuid not null references crm.person(id),
  kind text not null check (kind in ('phone', 'email', 'application_no', 'external_id')),
  value_raw text not null,
  value_norm text not null,            -- phone: E.164 (+91...), email: lower+trim
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, kind, value_norm)   -- THE dedupe rule. Use ON CONFLICT against this.
);
create index on crm.person_identifier (tenant_id, person_id);
select crm.enable_tenant_rls('crm.person_identifier');

create table crm.admission_cycle (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  name text not null,                  -- e.g. 2026-27
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  check (ends_on >= starts_on),
  unique (tenant_id, name)
);
create unique index admission_cycle_one_current on crm.admission_cycle (tenant_id) where is_current;
select crm.enable_tenant_rls('crm.admission_cycle');

create table crm.lead_sub_stage (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  core_stage text not null check (core_stage in
    ('new','attempting','connected','interested','visit_booked','visited','applied','fee_paid','enrolled','lost','invalid')),
  name text not null,
  sort_order int not null default 0,
  unique (tenant_id, core_stage, name)
);
select crm.enable_tenant_rls('crm.lead_sub_stage');

create table crm.lead (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  person_id uuid not null references crm.person(id),
  cycle_id uuid not null references crm.admission_cycle(id),
  source_id uuid references crm.intake_source(id),
  program_id uuid references crm.program(id),
  stage text not null default 'new' check (stage in
    ('new','attempting','connected','interested','visit_booked','visited','applied','fee_paid','enrolled','lost','invalid')),
  sub_stage_id uuid references crm.lead_sub_stage(id),
  -- cache maintained ONLY by the trigger on lead_temperature_observation. Never write it directly.
  current_temperature text check (current_temperature in ('hot', 'warm', 'cold', 'invalid')),
  next_step text check (next_step in
    ('book_visit','fill_form','pay_fee','callback','counsellor_call','send_info','none')),
  next_step_due_at timestamptz,
  owner_counsellor_id uuid references crm."user"(id),
  ai_agent_id uuid references crm.ai_agent(id),
  lost_reason text,
  last_reject_code text,               -- last policy rejection, shown on Lead 360
  last_reject_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, person_id, cycle_id)   -- one lead per person per cycle
);
create index on crm.lead (tenant_id, stage);
create index on crm.lead (tenant_id, owner_counsellor_id);
create index on crm.lead (tenant_id, ai_agent_id);
create index on crm.lead (tenant_id, created_at desc);
create index on crm.lead (tenant_id, next_step_due_at) where next_step_due_at is not null;
create trigger lead_updated_at before update on crm.lead
  for each row execute function crm.set_updated_at();
select crm.enable_tenant_rls('crm.lead');

create table crm.lead_stage_history (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  lead_id uuid not null references crm.lead(id),
  from_stage text,
  to_stage text not null,
  reason text,
  actor text not null check (actor in ('user', 'ai', 'system', 'integration')),
  actor_user_id uuid references crm."user"(id),
  created_at timestamptz not null default now()      -- handbook calls this "at"
);
create index on crm.lead_stage_history (tenant_id, lead_id, created_at);
select crm.enable_tenant_rls('crm.lead_stage_history', true);

create table crm.consent_record (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  person_id uuid not null references crm.person(id),
  channel text not null check (channel in ('voice', 'whatsapp', 'sms', 'email')),
  purpose text not null,
  granted boolean not null,            -- revocation = a NEW row with granted=false
  source text not null,
  evidence jsonb,
  created_at timestamptz not null default now()
);
create index on crm.consent_record (tenant_id, person_id, channel, created_at desc);
select crm.enable_tenant_rls('crm.consent_record', true);

create table crm.suppression (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  kind text not null check (kind in ('phone', 'email')),
  value_norm text not null,
  reason text not null check (reason in ('dnd', 'ndnc', 'opt_out', 'invalid')),
  source text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, kind, value_norm, reason)
);
select crm.enable_tenant_rls('crm.suppression');

create table crm.lead_note (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  lead_id uuid not null references crm.lead(id),
  author_id uuid references crm."user"(id),
  body text not null,
  kind text not null default 'note' check (kind in ('note', 'outcome', 'comment')),
  created_at timestamptz not null default now()
);
create index on crm.lead_note (tenant_id, lead_id, created_at);
select crm.enable_tenant_rls('crm.lead_note');

create table crm.task (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  lead_id uuid not null references crm.lead(id),
  assignee_id uuid references crm."user"(id),
  title text not null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  kind text not null default 'follow_up' check (kind in ('callback', 'follow_up', 'document')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on crm.task (tenant_id, assignee_id, status, due_at);
create trigger task_updated_at before update on crm.task
  for each row execute function crm.set_updated_at();
select crm.enable_tenant_rls('crm.task');

create table crm.duplicate_candidate (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  person_a uuid not null references crm.person(id),
  person_b uuid not null references crm.person(id),
  reason text not null,
  status text not null default 'open' check (status in ('open', 'merged', 'dismissed')),
  created_at timestamptz not null default now(),
  check (person_a <> person_b),
  unique (tenant_id, person_a, person_b)
);
select crm.enable_tenant_rls('crm.duplicate_candidate');

-- migrate:down
drop table if exists crm.duplicate_candidate;
drop table if exists crm.task;
drop table if exists crm.lead_note;
drop table if exists crm.suppression;
drop table if exists crm.consent_record;
drop table if exists crm.lead_stage_history;
drop table if exists crm.lead;
drop table if exists crm.lead_sub_stage;
drop table if exists crm.admission_cycle;
drop table if exists crm.person_identifier;
drop table if exists crm.person;
