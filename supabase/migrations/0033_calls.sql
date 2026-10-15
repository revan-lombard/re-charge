-- Re-Charge admin: call recordings, transcribed and summarised on the office PC (ADMIN.md 8cu).
-- The panel uploads the audio and queues it; hub/worker.py on the PC collects it through the
-- call-jobs function (hub password), transcribes it with Whisper, summarises it with the local
-- model and sends the result back. The audio never goes to an outside AI.
create table if not exists calls (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid references projects(id) on delete cascade,
  title        text,
  audio_path   text not null,                 -- object in bucket "calls"
  status       text not null default 'queued' check (status in ('queued','working','done','failed')),
  seconds      integer,
  transcript   text,
  summary      jsonb,                         -- {summary, wants, decisions[], actions[], next_step, prices[], follow_up}
  error        text,
  claimed_at   timestamptz,
  done_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists calls_project_idx on calls (project_id, created_at desc);
create index if not exists calls_queue_idx on calls (created_at) where status in ('queued','working');
alter table calls enable row level security;
drop policy if exists calls_staff on calls;
create policy calls_staff on calls for all using (is_staff()) with check (is_staff());

-- private bucket for the recordings (50 MB each), staff only
insert into storage.buckets (id, name, public, file_size_limit)
values ('calls', 'calls', false, 52428800)
on conflict (id) do nothing;
drop policy if exists calls_objects_staff on storage.objects;
create policy calls_objects_staff on storage.objects for all
  using (bucket_id = 'calls' and is_staff()) with check (bucket_id = 'calls' and is_staff());
