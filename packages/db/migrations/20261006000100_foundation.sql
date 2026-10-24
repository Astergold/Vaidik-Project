-- migrate:up
-- Foundation: schema, roles, id generator, tenant-context helpers.
-- RULE: every object lives in schema crm. Never create anything in schema public.

create schema if not exists crm;

-- The application role. NOT a superuser, NOT BYPASSRLS, owns NO tables.
-- Login + password are set outside migrations (infra / dev init script):
--   ALTER ROLE crm_app LOGIN PASSWORD '...';
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'crm_app') then
    create role crm_app nologin noinherit nobypassrls;
  end if;
end $$;

grant usage on schema crm to crm_app;

-- UUIDv7 (time-ordered). Postgres 17 has no native uuidv7() (arrives in 18).
create function crm.uuid_v7() returns uuid
language sql volatile parallel safe as $$
  select encode(
    set_bit(
      set_bit(
        overlay(uuid_send(gen_random_uuid())
                placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
                from 1 for 6),
        52, 1),
      53, 1),
    'hex')::uuid
$$;

-- Tenant context. The API runs, at the start of every request transaction:
--   select set_config('app.tenant_id', $1, true);      -- true = transaction-local
-- If unset (or empty) this returns NULL, so every RLS policy matches zero rows
-- instead of raising an error. Fail closed.
create function crm.current_tenant_id() returns uuid
language sql stable parallel safe as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

create function crm.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Whitespace-collapsing normaliser used by the verbatim-quote triggers.
create function crm.norm_ws(t text) returns text
language sql immutable parallel safe as $$
  select btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g'))
$$;

-- Helper used by migrations: enable RLS + standard tenant policy + grants for the app role.
-- p_append_only => app role gets SELECT, INSERT only (no UPDATE/DELETE).
create function crm.enable_tenant_rls(p_table regclass, p_append_only boolean default false)
returns void language plpgsql as $$
begin
  execute format('alter table %s enable row level security', p_table);
  execute format(
    'create policy tenant_isolation on %s
       using (tenant_id = crm.current_tenant_id())
       with check (tenant_id = crm.current_tenant_id())', p_table);
  if p_append_only then
    execute format('grant select, insert on %s to crm_app', p_table);
  else
    execute format('grant select, insert, update, delete on %s to crm_app', p_table);
  end if;
end $$;

revoke all on function crm.enable_tenant_rls(regclass, boolean) from public;
grant execute on function crm.uuid_v7() to crm_app;
grant execute on function crm.current_tenant_id() to crm_app;
grant execute on function crm.set_updated_at() to crm_app;
grant execute on function crm.norm_ws(text) to crm_app;

-- migrate:down
drop function if exists crm.enable_tenant_rls(regclass, boolean);
drop function if exists crm.norm_ws(text);
drop function if exists crm.set_updated_at();
drop function if exists crm.current_tenant_id();
drop function if exists crm.uuid_v7();
-- schema + role are kept on purpose (other objects / other environments may depend on them)
