-- Re-Charge — per-prospect demo assistants.
--
-- The AI equivalent of the free mockup: before a prospect has bought anything, we
-- build them a working assistant from their own public information (hours, services,
-- prices, FAQs) and send them a link. They ask it their own questions and see the
-- product working for their business, not ours.
--
-- One row per demo. `knowledge` is the facts the assistant may use — written by us
-- from public information, so nothing confidential lives here. The `assistant`
-- function reads it with the service role; only staff touch it from the panel.

create table if not exists assistant_demos (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  business       text not null,
  knowledge      text not null,
  project_id     uuid references projects(id) on delete set null,
  views          integer not null default 0,
  last_viewed_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists assistant_demos_project on assistant_demos (project_id);

alter table assistant_demos enable row level security;
drop policy if exists assistant_demos_staff on assistant_demos;
create policy assistant_demos_staff on assistant_demos for all
  using (is_staff()) with check (is_staff());
