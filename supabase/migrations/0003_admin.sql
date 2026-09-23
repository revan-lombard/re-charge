-- Re-Charge backend — admin panel (/admin/)
-- Additive only. Safe to run repeatedly. See ADMIN.md.
--
-- Adds: two outreach stages before 'new'; sales fields on projects; automatic
-- timeline events on status change; spam-sender memory; templates / messages /
-- settings tables (for the comms phase); care-renewal fields on clients; and the
-- staff WRITE policies the panel needs (until now staff could only read most
-- tables and update projects).

-- ---------- pipeline stages ----------
-- Cold outreach lives in the same pipeline as website enquiries.
alter type project_status add value if not exists 'prospect'  before 'new';
alter type project_status add value if not exists 'contacted' before 'new';

-- ---------- projects: sales fields ----------
alter table projects add column if not exists source          text not null default 'website';
alter table projects add column if not exists quote_cents     integer;
alter table projects add column if not exists next_action     text;
alter table projects add column if not exists next_action_at  timestamptz;
alter table projects add column if not exists declined_reason text;
alter table projects add column if not exists starred         boolean not null default false;
alter table projects add column if not exists archived        boolean not null default false;
alter table projects add column if not exists spam            boolean not null default false;
alter table projects add column if not exists snoozed_until   timestamptz;
alter table projects add column if not exists preview_url     text;      -- mockup / staging link

create index if not exists projects_status_idx      on projects (status);
create index if not exists projects_email_idx       on projects (lower(email));
create index if not exists projects_next_action_idx on projects (next_action_at) where next_action_at is not null;
create index if not exists project_events_project_idx on project_events (project_id, created_at desc);

-- ---------- spam-sender memory ----------
create table if not exists spam_senders (
  email       text primary key,
  created_at  timestamptz not null default now()
);
alter table spam_senders enable row level security;
drop policy if exists spam_senders_staff on spam_senders;
create policy spam_senders_staff on spam_senders for all
  using (is_staff()) with check (is_staff());

-- ---------- triggers ----------
-- On insert: derive `source` from the form type when the website didn't say,
-- and auto-flag senders already marked as spam.
create or replace function projects_before_insert() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.source is null or new.source = 'website' then
    new.source := case new.details->>'formType'
      when 'Call request'        then 'call'
      when 'Free mockup request' then 'mockup'
      else coalesce(nullif(new.source, ''), 'website') end;
  end if;
  if new.email is not null and exists (
       select 1 from spam_senders s where s.email = lower(new.email)) then
    new.spam := true;
    new.archived := true;
  end if;
  return new;
end $$;
drop trigger if exists trg_projects_before_insert on projects;
create trigger trg_projects_before_insert before insert on projects
  for each row execute function projects_before_insert();

-- On status change: append a timeline event, whoever made the change (the
-- panel, the Yoco webhook, or SQL). Gives an audit trail for free.
create or replace function projects_status_event() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into project_events (project_id, kind, note, data)
    values (new.id, 'status',
            replace(old.status::text, '_', ' ') || ' → ' || replace(new.status::text, '_', ' '),
            jsonb_build_object('from', old.status, 'to', new.status,
                               'reason', new.declined_reason,
                               'by', coalesce(auth.uid()::text, 'system')));
  end if;
  return new;
end $$;
drop trigger if exists trg_projects_status_event on projects;
create trigger trg_projects_status_event after update of status on projects
  for each row execute function projects_status_event();

-- Backfill source for rows that predate this migration.
update projects set source = case details->>'formType'
    when 'Call request'        then 'call'
    when 'Free mockup request' then 'mockup'
    else 'website' end
  where source = 'website';

-- ---------- comms (templates / send log / settings) ----------
create table if not exists templates (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('email','whatsapp')),
  name        text not null,
  subject     text,
  body        text not null default '',
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists messages (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references projects(id) on delete set null,
  kind         text not null check (kind in ('email','whatsapp')),
  to_address   text,
  subject      text,
  body         text,
  template_id  uuid references templates(id) on delete set null,
  provider_id  text,                     -- Resend message id
  status       text not null default 'sent',   -- sent | delivered | bounced | opened(whatsapp)
  created_at   timestamptz not null default now()
);
create index if not exists messages_project_idx on messages (project_id, created_at desc);

create table if not exists settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table templates enable row level security;
alter table messages  enable row level security;
alter table settings  enable row level security;
drop policy if exists templates_staff on templates;
create policy templates_staff on templates for all using (is_staff()) with check (is_staff());
drop policy if exists messages_staff on messages;
create policy messages_staff on messages for all using (is_staff()) with check (is_staff());
drop policy if exists settings_staff on settings;
create policy settings_staff on settings for all using (is_staff()) with check (is_staff());

-- ---------- clients: care renewals + contact ----------
alter table clients add column if not exists care_renews_at date;
alter table clients add column if not exists phone text;
alter table clients add column if not exists email text;

-- ---------- staff write policies ----------
-- projects: staff may add leads (outreach, phone enquiries) and clean up spam.
drop policy if exists projects_insert on projects;
create policy projects_insert on projects for insert with check (is_staff());
drop policy if exists projects_delete on projects;
create policy projects_delete on projects for delete using (is_staff());
-- projects_update exists (staff) but has no WITH CHECK; add one so RLS is explicit.
drop policy if exists projects_update on projects;
create policy projects_update on projects for update
  using (is_staff()) with check (is_staff());

-- project_events: staff add notes and manual events.
drop policy if exists project_events_insert on project_events;
create policy project_events_insert on project_events for insert with check (is_staff());

-- clients: staff create and edit client records.
drop policy if exists clients_insert on clients;
create policy clients_insert on clients for insert with check (is_staff());
drop policy if exists clients_update on clients;
create policy clients_update on clients for update using (is_staff()) with check (is_staff());

-- payments: staff record EFTs and match Yoco payments to projects.
drop policy if exists payments_insert on payments;
create policy payments_insert on payments for insert with check (is_staff());
drop policy if exists payments_update on payments;
create policy payments_update on payments for update using (is_staff()) with check (is_staff());
