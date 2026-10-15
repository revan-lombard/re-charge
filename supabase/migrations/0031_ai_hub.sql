-- Re-Charge: the home AI hub (ADMIN.md 8cq). Every AI job is logged (which engine, how long),
-- and each website enquiry gets an automatic sort: kind, urgency, summary, next step.
create table if not exists ai_jobs (
  id         bigserial primary key,
  task       text not null,                 -- 'sort', …
  engine     text not null,                 -- 'local' (the home hub) | 'claude'
  ms         integer,
  ok         boolean not null default true,
  error      text,
  created_at timestamptz not null default now()
);
create index if not exists ai_jobs_created_idx on ai_jobs (created_at desc);
alter table ai_jobs enable row level security;
drop policy if exists ai_jobs_staff on ai_jobs;
create policy ai_jobs_staff on ai_jobs for select using (is_staff());

alter table projects add column if not exists ai_sort jsonb;   -- {kind, urgency, summary, next_step, is_lead, engine, at}
