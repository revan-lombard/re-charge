-- Re-Charge: the office PC collects its AI jobs (hub/README.md, ADMIN.md 8da). Safe to run twice.
--
-- Instead of the website's backend calling the PC at a public address (Tailscale Funnel), the
-- backend leaves each job here and waits a few seconds; hub/worker.py on the PC collects it through
-- the hub-jobs function (hub password), answers it with LM Studio and hands the answer back. The PC
-- only ever calls out, so nothing on it is open to the internet.
--
-- ai_requests holds a job only while it's being answered: the backend deletes it as soon as it has
-- the answer (or stops waiting), and a database job below sweeps away anything whose wait ended more
-- than a minute ago, whether or not the PC is on. Only the server functions (service role) can read
-- or write it.
create table if not exists ai_requests (
  id          uuid primary key default gen_random_uuid(),
  task        text not null,                  -- 'site-chat', 'demo-chat', 'site-draft', 'sort', 'draft', 'read-doc'
  body        jsonb not null,                 -- the chat request for the model: messages, max_tokens, temperature
  status      text not null default 'queued' check (status in ('queued', 'working', 'done', 'failed')),
  result      text,
  error       text,
  claimed_at  timestamptz,
  expires_at  timestamptz not null,           -- the backend stops waiting then; the PC skips anything past it
  created_at  timestamptz not null default now()
);
create index if not exists ai_requests_queue_idx on ai_requests (created_at) where status = 'queued';
alter table ai_requests enable row level security;   -- no policies: the service role only

-- One row: when the PC last checked in, and whether its model is answering. The website treats the
-- PC as online when LM Studio is ready and the PC checked in within the last 35 seconds, or is busy
-- answering a job (busy_until).
create table if not exists hub_status (
  id          integer primary key default 1 check (id = 1),
  last_seen   timestamptz,
  ready       boolean not null default false,
  models      text[] not null default '{}',
  version     text,
  busy_until  timestamptz
);
alter table hub_status add column if not exists busy_until timestamptz;
alter table hub_status enable row level security;    -- no policies: the service role only

-- Hand the oldest waiting job to the PC, once: two workers can never take the same one. A job with
-- less than 5 seconds of its wait left is left alone: no answer would arrive in time.
create or replace function claim_ai_request() returns setof ai_requests
language sql security definer set search_path = public as $$
  update ai_requests set status = 'working', claimed_at = now()
  where id = (select id from ai_requests where status = 'queued' and expires_at > now() + interval '5 seconds'
              order by created_at limit 1 for update skip locked)
  returning *;
$$;
revoke all on function claim_ai_request() from public, anon, authenticated;
grant execute on function claim_ai_request() to service_role;

-- The sweep, inside the database (no function calls): every 5 minutes, delete any job whose wait
-- ended more than a minute ago. Normally there is none; this covers a backend that stopped mid-wait.
-- If pg_cron isn't available the migration still succeeds, and hub-jobs sweeps when the PC checks in.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('re-charge-ai-requests-sweep') where exists (select 1 from cron.job where jobname = 're-charge-ai-requests-sweep');
  perform cron.schedule('re-charge-ai-requests-sweep', '*/5 * * * *', $job$
    delete from public.ai_requests where expires_at < now() - interval '1 minute';
  $job$);
  raise notice 'AI job sweep scheduled every 5 minutes';
exception when others then
  raise notice 'could not schedule the AI job sweep (%); hub-jobs still sweeps when the PC checks in', sqlerrm;
end $$;
