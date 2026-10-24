-- migrate:up

-- tenant.id == organization.id (Better Auth organization IS the tenant membership).
-- Creating a tenant: generate the uuid app-side, set app.tenant_id to it, insert organization
-- then tenant (the RLS WITH CHECK below passes because id = current tenant).
create table crm.tenant (
  id uuid primary key references crm.organization(id) on delete restrict,
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}$'),
  status text not null default 'active' check (status in ('active', 'suspended')),
  timezone text not null default 'Asia/Kolkata',
  plan_id uuid,                       -- FK added by the billing migration (Day 6)
  dograh_org_id text,                 -- never exposed to tenants
  -- unguessable key used in inbound webhook URLs: /api/webhooks/dograh/:tenantKey
  webhook_key text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tenant_updated_at before update on crm.tenant
  for each row execute function crm.set_updated_at();

alter table crm.tenant enable row level security;
create policy tenant_isolation on crm.tenant
  using (id = crm.current_tenant_id())
  with check (id = crm.current_tenant_id());
-- No DELETE for the app role. Cross-tenant platform listing = definer function added on Day 6.
grant select, insert, update on crm.tenant to crm_app;

create table crm.tenant_secret (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  kind text not null,                 -- dograh_api_key | llm_key | whatsapp_key | tool_hmac | dograh_webhook ...
  ciphertext bytea not null,
  iv bytea not null,
  auth_tag bytea not null,            -- AES-256-GCM tag (added vs handbook: GCM needs it)
  key_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, kind)
);
create trigger tenant_secret_updated_at before update on crm.tenant_secret
  for each row execute function crm.set_updated_at();
select crm.enable_tenant_rls('crm.tenant_secret');

create table crm.tenant_branding (
  tenant_id uuid primary key references crm.tenant(id),
  product_name text not null default 'Vernacular AI',
  logo_key text,
  favicon_key text,
  colours jsonb not null default '{}'::jsonb,
  email_from text,
  whatsapp_sender text,
  updated_at timestamptz not null default now()
);
create trigger tenant_branding_updated_at before update on crm.tenant_branding
  for each row execute function crm.set_updated_at();
select crm.enable_tenant_rls('crm.tenant_branding');

create table crm.tenant_domain (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  hostname text not null unique check (hostname = lower(hostname)),
  verification_token text not null default replace(gen_random_uuid()::text, '-', ''),
  verified_at timestamptz,
  tls_status text not null default 'pending' check (tls_status in ('pending', 'issued', 'failed')),
  created_at timestamptz not null default now()
);
create index on crm.tenant_domain (tenant_id);
select crm.enable_tenant_rls('crm.tenant_domain');

-- Defaults = handbook §7.3. Window end is EXCLUSIVE (21:00 rejected, 20:59 allowed).
create table crm.tenant_policy (
  tenant_id uuid primary key references crm.tenant(id),
  call_window_start time not null default '09:00',
  call_window_end time not null default '21:00',
  allowed_days smallint[] not null default '{1,2,3,4,5,6}',  -- ISO: 1=Mon .. 7=Sun
  max_attempts_per_day int not null default 3 check (max_attempts_per_day > 0),
  max_attempts_total int not null default 8 check (max_attempts_total > 0),
  min_gap_minutes int not null default 60 check (min_gap_minutes >= 0),
  require_consent boolean not null default true,
  ndnc_check boolean not null default true,
  promo_requires_140 boolean not null default false,          -- flag only until legal decides
  ai_disclosure_text text,
  updated_at timestamptz not null default now()
);
create trigger tenant_policy_updated_at before update on crm.tenant_policy
  for each row execute function crm.set_updated_at();
select crm.enable_tenant_rls('crm.tenant_policy');

-- Replaces holiday_calendar_id from the handbook with a simple per-tenant date list.
create table crm.tenant_holiday (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  on_date date not null,
  name text not null,
  unique (tenant_id, on_date)
);
select crm.enable_tenant_rls('crm.tenant_holiday');

create table crm.audit_log (
  id uuid primary key default crm.uuid_v7(),
  tenant_id uuid not null references crm.tenant(id),
  actor_user_id uuid references crm."user"(id),
  impersonator_id uuid references crm."user"(id),
  action text not null,
  entity text not null,
  entity_id text,
  diff jsonb,
  ip inet,
  created_at timestamptz not null default now()
);
create index on crm.audit_log (tenant_id, created_at desc);
create index on crm.audit_log (tenant_id, entity, entity_id);
select crm.enable_tenant_rls('crm.audit_log', true);

-- ---------------------------------------------------------------------------------------
-- Pre-tenant lookups. These run BEFORE a tenant context exists (Host header, webhook key).
-- SECURITY DEFINER (owner bypasses RLS), fixed search_path, return only what is needed,
-- executable by crm_app only. Do NOT add a bypass-RLS role to request code instead.
-- ---------------------------------------------------------------------------------------
create function crm.resolve_tenant_by_domain(p_host text)
returns table (tenant_id uuid, slug text, status text)
language sql stable security definer set search_path = crm, pg_temp as $$
  select t.id, t.slug, t.status
    from crm.tenant t
    join crm.tenant_domain d on d.tenant_id = t.id
   where d.hostname = lower(p_host) and d.verified_at is not null
$$;

create function crm.resolve_tenant_by_slug(p_slug text)
returns table (tenant_id uuid, slug text, status text)
language sql stable security definer set search_path = crm, pg_temp as $$
  select t.id, t.slug, t.status from crm.tenant t where t.slug = lower(p_slug)
$$;

create function crm.resolve_tenant_by_webhook_key(p_key text)
returns table (tenant_id uuid, slug text, status text)
language sql stable security definer set search_path = crm, pg_temp as $$
  select t.id, t.slug, t.status from crm.tenant t where t.webhook_key = p_key
$$;

-- Caddy on_demand_tls "ask": only verified custom domains get a certificate.
create function crm.domain_allowed(p_host text) returns boolean
language sql stable security definer set search_path = crm, pg_temp as $$
  select exists (
    select 1 from crm.tenant_domain d join crm.tenant t on t.id = d.tenant_id
     where d.hostname = lower(p_host) and d.verified_at is not null and t.status = 'active')
$$;

revoke all on function crm.resolve_tenant_by_domain(text) from public;
revoke all on function crm.resolve_tenant_by_slug(text) from public;
revoke all on function crm.resolve_tenant_by_webhook_key(text) from public;
revoke all on function crm.domain_allowed(text) from public;
grant execute on function crm.resolve_tenant_by_domain(text) to crm_app;
grant execute on function crm.resolve_tenant_by_slug(text) to crm_app;
grant execute on function crm.resolve_tenant_by_webhook_key(text) to crm_app;
grant execute on function crm.domain_allowed(text) to crm_app;

-- migrate:down
drop function if exists crm.domain_allowed(text);
drop function if exists crm.resolve_tenant_by_webhook_key(text);
drop function if exists crm.resolve_tenant_by_slug(text);
drop function if exists crm.resolve_tenant_by_domain(text);
drop table if exists crm.audit_log;
drop table if exists crm.tenant_holiday;
drop table if exists crm.tenant_policy;
drop table if exists crm.tenant_domain;
drop table if exists crm.tenant_branding;
drop table if exists crm.tenant_secret;
drop table if exists crm.tenant;
