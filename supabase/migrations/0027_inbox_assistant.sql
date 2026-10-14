-- Re-Charge — the Inbox Assistant (inbox-assistant.html): AI drafts replies to a client's
-- customer emails, in their own Gmail, for a person to check and send.
--
-- inbox_accounts  one row per connected inbox: whose it is, what the AI may say (knowledge),
--                 and the day-one baseline the two-week trial is measured against. Staff only.
-- inbox_secrets   the Google tokens for that inbox, encrypted (TOKEN_ENCRYPTION_KEY). No browser
--                 policy at all: only the Edge Functions (service role) can read them.
-- inbox_drafts    one row per customer email the assistant looked at: drafted or skipped, and
--                 later what happened to the draft (sent as is, sent edited, discarded). No email
--                 bodies are kept; the draft text is held encrypted only until it has been
--                 measured, then cleared.
-- inbox-run is called every 10 minutes by pg_cron.

create table if not exists inbox_accounts (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid references projects(id) on delete set null,
  client_id        uuid references clients(id) on delete set null,
  business         text not null,
  email            text,                                   -- the connected Gmail address
  provider         text not null default 'gmail',
  status           text not null default 'pending',        -- pending | active | paused | error | disconnected
  knowledge        text not null default '',               -- prices, policies, hours, how they like to reply
  signoff          text not null default '',               -- e.g. "Kind regards\nThandi\nMokoena Inc"
  baseline_minutes numeric not null default 6,             -- day one: minutes to answer one email by hand
  check_minutes    numeric not null default 1,             -- minutes to check and send a draft
  target_hours     numeric not null default 5,             -- hours a week the trial must save
  trial_started_at timestamptz,
  label_id         text,                                   -- the Gmail label "AI draft ready"
  last_run_at      timestamptz,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists inbox_accounts_project on inbox_accounts (project_id);
create index if not exists inbox_accounts_client on inbox_accounts (client_id);

create table if not exists inbox_secrets (
  account_id    uuid primary key references inbox_accounts(id) on delete cascade,
  refresh_token text,
  access_token  text,
  expires_at    timestamptz,
  updated_at    timestamptz not null default now()
);

create table if not exists inbox_drafts (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references inbox_accounts(id) on delete cascade,
  message_id    text not null,                             -- Gmail id of the customer's email
  thread_id     text,
  draft_id      text,
  status        text not null,                             -- drafted | skipped | sent | discarded | expired
  reason        text,                                      -- why it was skipped
  gist          text,                                      -- one line: what the customer wanted
  checks        jsonb not null default '[]'::jsonb,        -- the gaps a person must fill
  draft_text    text,                                      -- encrypted; cleared once measured
  similarity    numeric,                                   -- 0..1, sent reply vs the draft
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  unique (account_id, message_id)
);
create index if not exists inbox_drafts_account_time on inbox_drafts (account_id, created_at desc);
create index if not exists inbox_drafts_open on inbox_drafts (status) where status = 'drafted';

alter table inbox_accounts enable row level security;
alter table inbox_secrets  enable row level security;   -- no policy: service role only
alter table inbox_drafts   enable row level security;
drop policy if exists inbox_accounts_staff on inbox_accounts;
create policy inbox_accounts_staff on inbox_accounts for all using (is_staff()) with check (is_staff());
drop policy if exists inbox_drafts_staff on inbox_drafts;
create policy inbox_drafts_staff on inbox_drafts for select using (is_staff());

do $$
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;
  perform cron.unschedule('re-charge-inbox-run') where exists (select 1 from cron.job where jobname = 're-charge-inbox-run');
  perform cron.schedule('re-charge-inbox-run', '*/10 * * * *', $job$
    select net.http_post(
      url := 'https://aqwdncyihcbktbbuvvzd.supabase.co/functions/v1/inbox-run',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"source": "cron"}'::jsonb,
      timeout_milliseconds := 55000
    );
  $job$);
  raise notice 'inbox-run scheduled every 10 minutes';
exception when others then
  raise notice 'could not schedule inbox-run automatically (%)', sqlerrm;
end $$;
