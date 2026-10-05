-- Re-Charge — proving the AI was worth paying for.
--
-- A Care plan is cancelled at month three when the client can't see what it did.
-- This migration adds the two halves of the answer:
--
--   1. assistant_usage — what the assistants actually handled, kept per day and
--      per assistant. assistant_hits (0023) can't do this job: it's the
--      rate-limit counter and gets deleted after two days. This is the durable
--      record the monthly report and the renewal conversation are argued from,
--      so it's never deleted — a year in, it's also the year-on-year comparison.
--
--   2. a live assistant belongs to a client. assistant_demos (0024) already
--      holds a prospect's demo; a paying client's real assistant is the same
--      thing pointed at a real business, so it lives in the same table with
--      kind = 'live' and the client it belongs to.
--
-- The baseline a client is measured against isn't here: it's the number we wrote
-- down before the job started, and it lives in projects.details.baseline, next to
-- the rest of what we know about that job.

alter table assistant_demos add column if not exists client_id uuid references clients(id) on delete set null;
alter table assistant_demos add column if not exists kind text not null default 'demo';
create index if not exists assistant_demos_client on assistant_demos (client_id);

comment on table assistant_demos is
  'One assistant. kind = demo: built for a prospect from public information, before they buy. kind = live: a paying client''s real assistant, client_id set.';

create table if not exists assistant_usage (
  scope       text not null,                    -- an assistant's slug, or 'site' for re-charge.co.za's own
  day         date not null,                    -- South African date, so the days line up with the client's month
  convos      integer not null default 0,       -- someone started a new conversation
  questions   integer not null default 0,       -- questions answered (a conversation is usually several)
  after_hours integer not null default 0,       -- of those questions, the ones nobody would have been there for
  primary key (scope, day)
);

alter table assistant_usage enable row level security;
drop policy if exists assistant_usage_staff on assistant_usage;
create policy assistant_usage_staff on assistant_usage for all
  using (is_staff()) with check (is_staff());

-- Counting has to be atomic: two people can ask the same assistant something in
-- the same millisecond, and read-then-write would lose one of them. The Edge
-- Function calls this instead of writing the row itself.
--
-- "After hours" is decided here rather than in the function so there is one
-- definition of it, in South African time: before 8am, from 5pm, or a weekend —
-- when a small business has nobody answering the phone. The monthly report says
-- this in those words, so the client can check it against their own day.
create or replace function assistant_usage_bump(p_scope text, p_convo boolean default false)
returns void language plpgsql as $$
declare
  ts      timestamp := now() at time zone 'Africa/Johannesburg';
  after_h integer   := case
                         when extract(isodow from ts) >= 6
                           or ts::time <  time '08:00'
                           or ts::time >= time '17:00'
                         then 1 else 0 end;
begin
  insert into assistant_usage (scope, day, convos, questions, after_hours)
  values (p_scope, ts::date, case when p_convo then 1 else 0 end, 1, after_h)
  on conflict (scope, day) do update set
    convos      = assistant_usage.convos      + excluded.convos,
    questions   = assistant_usage.questions   + excluded.questions,
    after_hours = assistant_usage.after_hours + excluded.after_hours;
end $$;

-- Only the Edge Function (service role) counts. The function runs as its caller,
-- so RLS applies to it too; taking execute away from the public roles means a
-- visitor who reaches the endpoint still can't reach the counter directly.
do $$
begin
  revoke execute on function assistant_usage_bump(text, boolean) from public;
  revoke execute on function assistant_usage_bump(text, boolean) from anon, authenticated;
  grant  execute on function assistant_usage_bump(text, boolean) to service_role;
exception when undefined_object then
  raise notice 'skipped the role grants (not a Supabase database)';
end $$;
