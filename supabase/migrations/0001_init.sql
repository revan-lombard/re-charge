-- Re-Charge backend — initial schema
-- Postgres / Supabase. Multi-client from day one; Re-Charge itself is a client.
-- Untested against a live database — deploy with `supabase db push` and verify.
--
-- Design notes:
--   * Row-Level Security (RLS) is ON for every table. The Edge Functions use the
--     service-role key and bypass RLS; browsers use the anon key and are limited
--     to what these policies allow.
--   * A "client" is a business on the platform. Staff (Re-Charge) see everything.
--   * OAuth tokens and analytics rows are readable ONLY by the service role —
--     no browser policy grants access to tokens.

create extension if not exists pgcrypto;

-- ---------- enums ----------
do $$ begin
  create type project_status as enum (
    'new','deposit_paid','under_review','clarification','quote_sent',
    'approved','in_development','client_review','final_payment','live','care','declined'
  );
exception when duplicate_object then null; end $$;

-- ---------- identity / tenancy ----------
create table if not exists clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  created_at  timestamptz not null default now()
);

-- links a Supabase auth user to a client (multi-tenant membership)
create table if not exists client_users (
  client_id   uuid not null references clients(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner','admin','member')),
  created_at  timestamptz not null default now(),
  primary key (client_id, user_id)
);

-- Re-Charge staff: can see and manage everything
create table if not exists staff (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- helper predicates (security definer so they can read the membership tables)
create or replace function is_staff() returns boolean
  language sql stable security definer set search_path = public as
$$ select exists (select 1 from staff s where s.user_id = auth.uid()) $$;

create or replace function is_member(target uuid) returns boolean
  language sql stable security definer set search_path = public as
$$ select exists (select 1 from client_users cu where cu.client_id = target and cu.user_id = auth.uid()) $$;

-- ---------- projects (the sales funnel record) ----------
create sequence if not exists project_ref_seq start 42;  -- first ref RC-00042

create table if not exists projects (
  id               uuid primary key default gen_random_uuid(),
  ref              text unique,
  client_id        uuid references clients(id) on delete set null,
  name             text,
  email            text,
  phone            text,
  business         text,
  category         text[] not null default '{}',
  goal             text,
  details          jsonb not null default '{}'::jsonb,
  budget           text,
  deadline         text,
  indicative_price text,
  channel          text,
  status           project_status not null default 'new',
  deposit_paid     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create or replace function set_project_ref() returns trigger
  language plpgsql as $$
begin
  if new.ref is null then
    new.ref := 'RC-' || lpad(nextval('project_ref_seq')::text, 5, '0');
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_projects_ref on projects;
create trigger trg_projects_ref before insert or update on projects
  for each row execute function set_project_ref();

-- append-only timeline: status changes, notes, payment events
create table if not exists project_events (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  kind        text not null,                 -- created | status | payment | note
  note        text,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ---------- payments (Yoco) ----------
create table if not exists payments (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references projects(id) on delete set null,
  provider     text not null default 'yoco',
  provider_id  text,                          -- Yoco payment/checkout id (idempotency)
  amount_cents integer,
  currency     text default 'ZAR',
  reference    text,                          -- what the payer typed / metadata
  email        text,
  status       text,                          -- succeeded | failed | ...
  matched      boolean not null default false,
  raw          jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  unique (provider, provider_id)
);

-- ---------- analytics (phase 2: GA4 + Search Console) ----------
-- Google OAuth tokens — service role ONLY. Never exposed to the browser.
create table if not exists oauth_credentials (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  provider      text not null default 'google',
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  scope         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (client_id, provider)
);

-- which GA4 / Search Console property is connected for a client
create table if not exists analytics_properties (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  kind        text not null check (kind in ('ga4','gsc')),
  property_id text not null,        -- GA4 property id, or GSC siteUrl
  display     text,
  created_at  timestamptz not null default now(),
  unique (client_id, kind)
);

-- cached, refreshed-on-schedule analytics payloads (so pages don't hit Google live)
create table if not exists analytics_cache (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  kind        text not null,        -- ga4:overview | ga4:traffic | gsc:queries | ...
  range       text not null,        -- 7d | 30d | 90d | custom:<from>_<to>
  payload     jsonb not null default '{}'::jsonb,
  fetched_at  timestamptz not null default now(),
  unique (client_id, kind, range)
);

-- ---------- RLS ----------
alter table clients             enable row level security;
alter table client_users        enable row level security;
alter table staff               enable row level security;
alter table projects            enable row level security;
alter table project_events      enable row level security;
alter table payments            enable row level security;
alter table oauth_credentials   enable row level security;
alter table analytics_properties enable row level security;
alter table analytics_cache     enable row level security;

-- clients: staff see all; members see their own client
drop policy if exists clients_read on clients;
create policy clients_read on clients for select
  using (is_staff() or is_member(id));

-- client_users: staff all; a user sees their own memberships
drop policy if exists client_users_read on client_users;
create policy client_users_read on client_users for select
  using (is_staff() or user_id = auth.uid());

-- staff table: only staff can read it
drop policy if exists staff_read on staff;
create policy staff_read on staff for select using (is_staff());

-- projects: staff all; members see/update their client's projects
drop policy if exists projects_read on projects;
create policy projects_read on projects for select
  using (is_staff() or (client_id is not null and is_member(client_id)));
drop policy if exists projects_update on projects;
create policy projects_update on projects for update
  using (is_staff());               -- only staff move a project through the pipeline

-- project_events: visible if the parent project is visible
drop policy if exists project_events_read on project_events;
create policy project_events_read on project_events for select
  using (is_staff() or exists (
    select 1 from projects p where p.id = project_id
      and p.client_id is not null and is_member(p.client_id)));

-- payments: staff only (financial data)
drop policy if exists payments_read on payments;
create policy payments_read on payments for select using (is_staff());

-- analytics: members see their client's properties + cached data; staff see all.
drop policy if exists analytics_properties_read on analytics_properties;
create policy analytics_properties_read on analytics_properties for select
  using (is_staff() or is_member(client_id));
drop policy if exists analytics_cache_read on analytics_cache;
create policy analytics_cache_read on analytics_cache for select
  using (is_staff() or is_member(client_id));

-- oauth_credentials: NO browser policy → unreadable except by the service role.
--   (Deliberately no select/insert/update policy here.)
