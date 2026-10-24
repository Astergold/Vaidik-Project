-- migrate:up
-- Better Auth tables (organization + admin plugins). Column names are camelCase on purpose:
-- they match Better Auth's default schema so D2-I2-02 needs no field mapping.
-- Run `npx @better-auth/cli generate` on Day 2 and put ANY diff in a NEW migration.
-- Better Auth must be configured with advanced.database.generateId = false (DB generates uuid_v7).
--
-- EXCEPTION to "RLS on every tenant table": auth tables are read BEFORE a tenant is known
-- (login, session lookup). They have no RLS; tenant authorisation happens in the service layer
-- (requireRole / requireLeadAccess) and every tenant data table behind them is RLS-protected.

create table crm."user" (
  id uuid primary key default crm.uuid_v7(),
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null default false,
  image text,
  "isPlatformAdmin" boolean not null default false,
  -- admin plugin
  role text,
  banned boolean default false,
  "banReason" text,
  "banExpires" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table crm.organization (
  id uuid primary key default crm.uuid_v7(),
  name text not null,
  slug text not null unique,
  logo text,
  metadata text,
  "createdAt" timestamptz not null default now()
);

create table crm.session (
  id uuid primary key default crm.uuid_v7(),
  "expiresAt" timestamptz not null,
  token text not null unique,
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid not null references crm."user"(id) on delete cascade,
  "activeOrganizationId" uuid references crm.organization(id) on delete set null,
  "impersonatedBy" uuid references crm."user"(id) on delete set null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index on crm.session ("userId");

create table crm.account (
  id uuid primary key default crm.uuid_v7(),
  "accountId" text not null,
  "providerId" text not null,
  "userId" uuid not null references crm."user"(id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index on crm.account ("userId");

create table crm.verification (
  id uuid primary key default crm.uuid_v7(),
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table crm.member (
  id uuid primary key default crm.uuid_v7(),
  "organizationId" uuid not null references crm.organization(id) on delete cascade,
  "userId" uuid not null references crm."user"(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'admission_head', 'counsellor')),
  "createdAt" timestamptz not null default now(),
  unique ("organizationId", "userId")
);
create index on crm.member ("userId");

create table crm.invitation (
  id uuid primary key default crm.uuid_v7(),
  "organizationId" uuid not null references crm.organization(id) on delete cascade,
  email text not null,
  role text check (role in ('owner', 'admin', 'admission_head', 'counsellor')),
  status text not null default 'pending',
  "expiresAt" timestamptz not null,
  "inviterId" uuid not null references crm."user"(id) on delete cascade,
  "createdAt" timestamptz not null default now()
);
create index on crm.invitation ("organizationId");

grant select, insert, update, delete on
  crm."user", crm.organization, crm.session, crm.account, crm.verification, crm.member, crm.invitation
  to crm_app;

-- migrate:down
drop table if exists crm.invitation;
drop table if exists crm.member;
drop table if exists crm.verification;
drop table if exists crm.account;
drop table if exists crm.session;
drop table if exists crm.organization;
drop table if exists crm."user";
