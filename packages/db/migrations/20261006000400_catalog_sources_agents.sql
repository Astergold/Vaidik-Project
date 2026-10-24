-- migrate:up
-- Minimal parents that lead / call_attempt reference. Day-4 migrations add fees, seats,
-- deadlines, KB and eligibility rules on top of crm.program (new files, never edits).

create table crm.program (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);
create trigger program_updated_at before update on crm.program
  for each row execute function crm.set_updated_at();
select crm.enable_tenant_rls('crm.program');

create table crm.ai_agent (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  display_name text not null,         -- tenant-facing name. Never a Dograh name.
  dograh_workflow_id text,            -- internal only, never returned by any API
  language text not null default 'en',
  voice text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger ai_agent_updated_at before update on crm.ai_agent
  for each row execute function crm.set_updated_at();
select crm.enable_tenant_rls('crm.ai_agent');

create table crm.ai_agent_counsellor (
  tenant_id uuid not null references crm.tenant(id),
  ai_agent_id uuid not null references crm.ai_agent(id) on delete cascade,
  user_id uuid not null references crm."user"(id) on delete cascade,
  primary key (ai_agent_id, user_id)
);
create index on crm.ai_agent_counsellor (tenant_id, user_id);
select crm.enable_tenant_rls('crm.ai_agent_counsellor');

create table crm.intake_source (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  -- appears in POST /api/intake/:sourceKey. Globally unique + unguessable.
  source_key text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  name text not null,
  kind text not null check (kind in ('form', 'aggregator', 'meta', 'google', 'csv', 'erp', 'inbound_call', 'whatsapp', 'manual')),
  secret_token_hash text,             -- argon2 hash of the bearer token (shown once at creation)
  field_mapping jsonb not null default '{}'::jsonb,
  default_program_id uuid references crm.program(id),
  default_agent_id uuid references crm.ai_agent(id),
  auto_dial boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on crm.intake_source (tenant_id);
create trigger intake_source_updated_at before update on crm.intake_source
  for each row execute function crm.set_updated_at();
select crm.enable_tenant_rls('crm.intake_source');

-- Pre-tenant lookup for the intake endpoint (the URL carries only the source key).
create function crm.resolve_intake_source(p_source_key text)
returns table (id uuid, tenant_id uuid, kind text, secret_token_hash text, field_mapping jsonb,
               default_program_id uuid, default_agent_id uuid, auto_dial boolean, tenant_status text)
language sql stable security definer set search_path = crm, pg_temp as $$
  select s.id, s.tenant_id, s.kind, s.secret_token_hash, s.field_mapping,
         s.default_program_id, s.default_agent_id, s.auto_dial, t.status
    from crm.intake_source s join crm.tenant t on t.id = s.tenant_id
   where s.source_key = p_source_key and s.is_active
$$;
revoke all on function crm.resolve_intake_source(text) from public;
grant execute on function crm.resolve_intake_source(text) to crm_app;

-- migrate:down
drop function if exists crm.resolve_intake_source(text);
drop table if exists crm.intake_source;
drop table if exists crm.ai_agent_counsellor;
drop table if exists crm.ai_agent;
drop table if exists crm.program;
