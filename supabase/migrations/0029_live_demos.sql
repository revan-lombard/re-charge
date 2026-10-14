-- Re-Charge — live demos (live-demo.html?d=<slug>): an interactive example of one kind of AI
-- work, built for one prospect during a conversation.
--
-- kind: email | invoices | enquiries | reviews | questions. We fill in the inputs in the panel
-- (how many a day, what comes in, who handles what, their facts); the `live-demo` function has
-- the AI write ten realistic items for their business and decide what happens to each one
-- (priority, action, the reply or captured fields), once. The page plays it back with a
-- "Run AI" button, an auto-mode switch, and the time saved at their real volume.
-- Staff edit; the page reads through the function.

create table if not exists live_demos (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  kind           text not null default 'email',
  project_id     uuid references projects(id) on delete set null,
  business       text not null,
  config         jsonb not null default '{}'::jsonb,  -- per_day, manual_minutes, light_minutes, types, routing, facts, signoff
  data           jsonb,                               -- { items: [...], built_at } written by the AI
  views          integer not null default 0,
  last_viewed_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists live_demos_project on live_demos (project_id);
alter table live_demos enable row level security;
drop policy if exists live_demos_staff on live_demos;
create policy live_demos_staff on live_demos for all using (is_staff()) with check (is_staff());
