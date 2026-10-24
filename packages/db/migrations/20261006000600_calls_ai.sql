-- migrate:up

create table crm.campaign (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  name text not null,
  ai_agent_id uuid not null references crm.ai_agent(id),
  lead_filter jsonb not null default '{}'::jsonb,
  schedule jsonb not null default '{}'::jsonb,
  daily_cap int,
  max_concurrent int not null default 5,
  status text not null default 'draft' check (status in ('draft', 'running', 'paused', 'stopped', 'completed')),
  created_by uuid references crm."user"(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger campaign_updated_at before update on crm.campaign
  for each row execute function crm.set_updated_at();
select crm.enable_tenant_rls('crm.campaign');

create table crm.call_attempt (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  lead_id uuid not null references crm.lead(id),
  campaign_id uuid references crm.campaign(id),
  ai_agent_id uuid references crm.ai_agent(id),
  direction text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  dograh_run_id text,                   -- internal only
  status text not null default 'reserved' check (status in
    ('reserved','dialing','in_progress','completed','failed','no_answer','busy','rejected')),
  reject_code text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_s int,
  disposition text,
  recording_key text,                   -- R2 key: tenants/<tenant_id>/recordings/<id>.<ext>
  transcript jsonb,
  transcript_text text,                 -- plain text; the quote triggers search THIS (added vs handbook)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- EXACTLY-ONCE DIALLING: at most one active call per lead. A second reserve fails -> job exits cleanly.
create unique index call_attempt_one_active_per_lead
  on crm.call_attempt (lead_id) where status in ('reserved', 'dialing', 'in_progress');
create unique index call_attempt_dograh_run
  on crm.call_attempt (tenant_id, dograh_run_id) where dograh_run_id is not null;
create index on crm.call_attempt (tenant_id, lead_id, created_at desc);
create index on crm.call_attempt (tenant_id, started_at);
create index on crm.call_attempt (tenant_id, campaign_id);
create trigger call_attempt_updated_at before update on crm.call_attempt
  for each row execute function crm.set_updated_at();
select crm.enable_tenant_rls('crm.call_attempt');

-- Raw mirror of provider runs. Upserted by the sync job (payload refreshed while a run progresses).
create table crm.dograh_run_raw (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  dograh_run_id text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  unique (tenant_id, dograh_run_id)
);
select crm.enable_tenant_rls('crm.dograh_run_raw');

create table crm.sync_cursor (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  source text not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  last_run_at timestamptz,
  counts jsonb not null default '{}'::jsonb,
  unique (tenant_id, source, window_start, window_end)
);
select crm.enable_tenant_rls('crm.sync_cursor');

create table crm.agent_tool_call (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  call_attempt_id uuid references crm.call_attempt(id),
  tool text not null,
  request jsonb,
  response jsonb,
  latency_ms int,
  ok boolean not null default true,
  cache_status text check (cache_status in ('hit', 'miss', 'bypass')),
  created_at timestamptz not null default now()
);
create index on crm.agent_tool_call (tenant_id, created_at desc);
create index on crm.agent_tool_call (tenant_id, call_attempt_id);
select crm.enable_tenant_rls('crm.agent_tool_call', true);

create table crm.analysis (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  call_attempt_id uuid not null unique references crm.call_attempt(id),   -- re-run = upsert
  model text,
  summary text,
  next_step text check (next_step in
    ('book_visit','fill_form','pay_fee','callback','counsellor_call','send_info','none')),
  next_step_due_at timestamptz,
  objections jsonb not null default '[]'::jsonb,   -- [{type, verbatim_quote}] quotes validated by trigger
  needs_counsellor boolean not null default false,
  needs_counsellor_reason text,
  language_detected text,
  extracted jsonb not null default '{}'::jsonb,    -- tenant_extraction_rules values (added Day 4)
  raw jsonb,
  created_at timestamptz not null default now()
);
select crm.enable_tenant_rls('crm.analysis');

create table crm.counsellor_queue_item (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  lead_id uuid not null references crm.lead(id),
  call_attempt_id uuid references crm.call_attempt(id),
  kind text not null check (kind in ('needs_counsellor', 'review_call', 'sla_breach')),
  reason text,
  assignee_id uuid references crm."user"(id),
  status text not null default 'open' check (status in ('open', 'claimed', 'resolved', 'dismissed')),
  due_at timestamptz,
  resolved_at timestamptz,
  outcome text,
  created_at timestamptz not null default now()
);
create index on crm.counsellor_queue_item (tenant_id, assignee_id, status, kind);
create index on crm.counsellor_queue_item (tenant_id, lead_id);
select crm.enable_tenant_rls('crm.counsellor_queue_item');

-- Single usage ledger. Price is stamped at write time. Wallet/plan tables come on Day 6.
create table crm.usage_event (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  kind text not null check (kind in ('call_minute', 'whatsapp', 'analyst_run', 'sms')),
  quantity numeric(14, 4) not null check (quantity >= 0),
  unit_price numeric(14, 6) not null default 0,
  call_attempt_id uuid references crm.call_attempt(id),
  ref text,
  created_at timestamptz not null default now()
);
create index on crm.usage_event (tenant_id, created_at);
create index on crm.usage_event (tenant_id, kind, created_at);
select crm.enable_tenant_rls('crm.usage_event', true);

create table crm.recording_access_log (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  call_attempt_id uuid not null references crm.call_attempt(id),
  user_id uuid references crm."user"(id),
  ip inet,
  created_at timestamptz not null default now()
);
create index on crm.recording_access_log (tenant_id, call_attempt_id);
select crm.enable_tenant_rls('crm.recording_access_log', true);

create table crm.lead_temperature_observation (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  lead_id uuid not null references crm.lead(id),
  value text not null check (value in ('hot', 'warm', 'cold', 'invalid')),
  source text not null check (source in ('ai_analyst', 'counsellor', 'system')),
  verbatim_quote text,
  call_attempt_id uuid references crm.call_attempt(id),
  observer_user_id uuid references crm."user"(id),
  reason text,
  observed_at timestamptz not null default now(),
  -- AI labels MUST carry a quote and the call they came from
  check (source <> 'ai_analyst' or (call_attempt_id is not null and length(crm.norm_ws(verbatim_quote)) > 0))
);
create index on crm.lead_temperature_observation (tenant_id, lead_id, observed_at desc);
select crm.enable_tenant_rls('crm.lead_temperature_observation', true);

-- ---------------------------------------------------------------------------------------
-- Verbatim-quote guard: a fabricated quote fails the WRITE (handbook §6.1).
-- Comparison is exact (case-sensitive) after collapsing whitespace on both sides.
-- ---------------------------------------------------------------------------------------
create function crm.quote_in_transcript(p_call_attempt_id uuid, p_quote text) returns boolean
language sql stable as $$
  select coalesce(
    (select position(crm.norm_ws(p_quote) in crm.norm_ws(c.transcript_text)) > 0
            and length(crm.norm_ws(p_quote)) > 0
       from crm.call_attempt c where c.id = p_call_attempt_id),
    false)
$$;
grant execute on function crm.quote_in_transcript(uuid, text) to crm_app;

create function crm.trg_observation_validate_quote() returns trigger
language plpgsql as $$
begin
  if new.source = 'ai_analyst' and not crm.quote_in_transcript(new.call_attempt_id, new.verbatim_quote) then
    raise exception 'verbatim_quote is not an exact substring of the call transcript'
      using errcode = '23514', constraint = 'observation_quote_in_transcript';
  end if;
  return new;
end $$;
create trigger observation_validate_quote before insert on crm.lead_temperature_observation
  for each row execute function crm.trg_observation_validate_quote();

-- Cache current temperature on the lead (latest observation by observed_at wins).
create function crm.trg_observation_update_lead() returns trigger
language plpgsql as $$
begin
  update crm.lead l
     set current_temperature = new.value
   where l.id = new.lead_id
     and not exists (select 1 from crm.lead_temperature_observation o
                      where o.lead_id = new.lead_id and o.observed_at > new.observed_at);
  return new;
end $$;
create trigger observation_update_lead after insert on crm.lead_temperature_observation
  for each row execute function crm.trg_observation_update_lead();

create function crm.trg_analysis_validate_quotes() returns trigger
language plpgsql as $$
declare
  o jsonb;
begin
  if jsonb_typeof(new.objections) <> 'array' then
    raise exception 'objections must be a JSON array' using errcode = '23514';
  end if;
  for o in select * from jsonb_array_elements(new.objections) loop
    if not crm.quote_in_transcript(new.call_attempt_id, o ->> 'verbatim_quote') then
      raise exception 'objection verbatim_quote is not an exact substring of the call transcript'
        using errcode = '23514', constraint = 'analysis_objection_quote_in_transcript';
    end if;
  end loop;
  return new;
end $$;
create trigger analysis_validate_quotes before insert or update of objections on crm.analysis
  for each row execute function crm.trg_analysis_validate_quotes();

-- migrate:down
drop table if exists crm.lead_temperature_observation;
drop function if exists crm.trg_observation_validate_quote();
drop function if exists crm.trg_observation_update_lead();
drop table if exists crm.recording_access_log;
drop table if exists crm.usage_event;
drop table if exists crm.counsellor_queue_item;
drop table if exists crm.analysis;
drop function if exists crm.trg_analysis_validate_quotes();
drop function if exists crm.quote_in_transcript(uuid, text);
drop table if exists crm.agent_tool_call;
drop table if exists crm.sync_cursor;
drop table if exists crm.dograh_run_raw;
drop table if exists crm.call_attempt;
drop table if exists crm.campaign;
