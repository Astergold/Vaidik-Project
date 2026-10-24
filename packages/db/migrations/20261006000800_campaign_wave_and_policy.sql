-- migrate:up
-- Phase 0c: batch_size on campaign, snapshot table for wave dispatch, webhook dedup, call_attempt scenario

alter table crm.campaign add column batch_size int not null default 100 check (batch_size in (100, 200));

create table crm.campaign_lead (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  campaign_id uuid not null references crm.campaign(id),
  lead_id uuid not null references crm.lead(id),
  wave_no int not null default 1,
  status text not null default 'pending' check (status in ('pending', 'dialing', 'done', 'skipped', 'failed')),
  skip_reason text,
  call_attempt_id uuid references crm.call_attempt(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, lead_id)
);
create index on crm.campaign_lead (tenant_id, campaign_id);
create index on crm.campaign_lead (tenant_id, lead_id);
select crm.enable_tenant_rls('crm.campaign_lead');
create trigger campaign_lead_updated_at before update on crm.campaign_lead for each row execute function crm.set_updated_at();

create table crm.webhook_event_processed (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  dograh_run_id text not null,
  event text not null,
  provider_event_id text,
  processed_at timestamptz not null default now(),
  unique (tenant_id, dograh_run_id, event, provider_event_id)
);
create index on crm.webhook_event_processed (tenant_id, dograh_run_id);
select crm.enable_tenant_rls('crm.webhook_event_processed');
create trigger webhook_event_processed_updated_at before update on crm.webhook_event_processed for each row execute function crm.set_updated_at();

alter table crm.call_attempt add column scenario text;
create index on crm.call_attempt (tenant_id, scenario) where scenario is not null;

alter table crm.tenant_policy add column counsellor_capacity int not null default 25;
alter table crm.tenant_policy add column assignment_rule text not null default 'round_robin' check (assignment_rule in ('round_robin', 'by_program', 'by_language'));

-- migrate:down
alter table crm.call_attempt drop column if exists scenario;
alter table crm.tenant_policy drop column if exists counsellor_capacity;
alter table crm.tenant_policy drop column if exists assignment_rule;
drop table if exists crm.webhook_event_processed;
drop table if exists crm.campaign_lead;
alter table crm.campaign drop column if exists batch_size;
