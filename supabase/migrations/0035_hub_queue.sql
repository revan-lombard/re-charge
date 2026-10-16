-- Re-Charge: the office PC collects its AI jobs (hub/README.md, ADMIN.md 8da). Safe to run twice.
--
-- Instead of the website's backend calling the PC at a public address (Tailscale Funnel), the
-- backend leaves each job here and waits a few seconds; hub/worker.py on the PC collects it through
-- the hub-jobs function (hub password), answers it with LM Studio and hands the answer back. The PC
-- only ever calls out, so nothing on it is open to the internet.
--
-- ai_requests holds a job only while it's being answered: the backend deletes it as soon as it has
-- the answer, and anything older than 10 minutes is swept away. Only the server functions (service
-- role) can read or write it.
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
-- PC as online when it checked in within the last 75 seconds and LM Studio is ready.
create table if not exists hub_status (
  id         integer primary key default 1 check (id = 1),
  last_seen  timestamptz,
  ready      boolean not null default false,
  models     text[] not null default '{}',
  version    text
);
alter table hub_status enable row level security;    -- no policies: the service role only

-- Hand the oldest waiting job to the PC, once: two workers can never take the same one.
create or replace function claim_ai_request() returns setof ai_requests
language sql security definer set search_path = public as $$
  update ai_requests set status = 'working', claimed_at = now()
  where id = (select id from ai_requests where status = 'queued' and expires_at > now()
              order by created_at limit 1 for update skip locked)
  returning *;
$$;
revoke all on function claim_ai_request() from public, anon, authenticated;
grant execute on function claim_ai_request() to service_role;
