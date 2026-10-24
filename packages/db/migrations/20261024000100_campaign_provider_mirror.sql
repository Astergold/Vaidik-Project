-- migrate:up
-- Campaigns are created ONLY in the CRM and mirrored to the voice platform's own campaign feature.
-- One CRM campaign = N waves (batch_size leads each); every wave is one platform campaign, created from a
-- CSV the CRM builds from its own leads. The platform dials, retries and enforces schedule/concurrency/circuit
-- breaker; the CRM owns membership, stages and assignment and syncs results back (campaign.sync job).

-- The workflow is now picked from the platform's list; an AI agent is optional (used for lead ownership only).
alter table crm.campaign alter column ai_agent_id drop not null;
alter table crm.campaign add column provider_workflow_id int;
alter table crm.campaign add column provider_workflow_name text;
alter table crm.campaign add column provider_telephony_config_id int;
alter table crm.campaign add column retry_config jsonb;
alter table crm.campaign add column circuit_breaker jsonb;
alter table crm.campaign add column schedule_enabled boolean not null default false;
alter table crm.campaign add column last_error text;
alter table crm.campaign add column last_synced_at timestamptz;
-- null = the platform's default concurrency (3); the organisation's concurrent-call limit applies on top
alter table crm.campaign alter column max_concurrent drop not null;
alter table crm.campaign alter column max_concurrent drop default;

create table crm.campaign_wave (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  campaign_id uuid not null references crm.campaign(id),
  wave_no int not null check (wave_no >= 1),
  -- null until the platform campaign is created
  provider_campaign_id int,
  state text not null default 'pending'
    check (state in ('pending', 'created', 'running', 'paused', 'completed', 'failed')),
  total_rows int not null default 0,
  processed_rows int not null default 0,
  failed_rows int not null default 0,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, wave_no)
);
create unique index campaign_wave_provider on crm.campaign_wave (tenant_id, provider_campaign_id)
  where provider_campaign_id is not null;
create index on crm.campaign_wave (tenant_id, campaign_id);
select crm.enable_tenant_rls('crm.campaign_wave');
create trigger campaign_wave_updated_at before update on crm.campaign_wave
  for each row execute function crm.set_updated_at();

create index campaign_lead_wave on crm.campaign_lead (tenant_id, campaign_id, wave_no, status);

-- migrate:down
drop index if exists crm.campaign_lead_wave;
drop table if exists crm.campaign_wave;
update crm.campaign set max_concurrent = 5 where max_concurrent is null;
alter table crm.campaign alter column max_concurrent set default 5;
alter table crm.campaign alter column max_concurrent set not null;
alter table crm.campaign drop column if exists last_synced_at;
alter table crm.campaign drop column if exists last_error;
alter table crm.campaign drop column if exists schedule_enabled;
alter table crm.campaign drop column if exists circuit_breaker;
alter table crm.campaign drop column if exists retry_config;
alter table crm.campaign drop column if exists provider_telephony_config_id;
alter table crm.campaign drop column if exists provider_workflow_name;
alter table crm.campaign drop column if exists provider_workflow_id;
-- rows created without an agent must be removed before the NOT NULL can come back
delete from crm.campaign_lead where campaign_id in (select id from crm.campaign where ai_agent_id is null);
update crm.call_attempt set campaign_id = null where campaign_id in (select id from crm.campaign where ai_agent_id is null);
delete from crm.campaign where ai_agent_id is null;
alter table crm.campaign alter column ai_agent_id set not null;
