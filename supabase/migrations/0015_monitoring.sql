-- Re-Charge — uptime monitoring for live sites.
--
-- The `site-monitor` Edge Function checks every client site (clients.site_label)
-- plus re-charge.co.za every 10 minutes: does it load, how fast, is HTTPS valid.
-- `monitors` holds the current state per site; `site_checks` the last 30 days.
-- A site is marked down after two failed checks in a row, and you get an email
-- when it goes down and when it's back (NOTIFY_EMAIL, via Resend).

alter table clients add column if not exists monitor boolean not null default true;   -- untick to stop checking a site

create table if not exists monitors (
  url           text primary key,                      -- https://mikesplumbing.co.za/
  label         text not null,
  client_id     uuid references clients(id) on delete cascade,
  status        text not null default 'unknown' check (status in ('unknown', 'up', 'slow', 'down')),
  since         timestamptz not null default now(),     -- when the current status began
  fail_count    integer not null default 0,              -- consecutive failed checks
  last_checked  timestamptz,
  last_ms       integer,
  last_http     integer,
  last_error    text,
  alerted_down  boolean not null default false
);

create table if not exists site_checks (
  id          bigint generated always as identity primary key,
  url         text not null,
  checked_at  timestamptz not null default now(),
  ok          boolean not null,
  http        integer,
  ms          integer,
  error       text
);
create index if not exists site_checks_url_time_idx on site_checks (url, checked_at desc);

alter table monitors enable row level security;
alter table site_checks enable row level security;
drop policy if exists monitors_staff on monitors;
create policy monitors_staff on monitors for all using (is_staff()) with check (is_staff());
drop policy if exists site_checks_staff on site_checks;
create policy site_checks_staff on site_checks for select using (is_staff());

-- Run the checker every 10 minutes (pg_cron + pg_net). If either extension
-- isn't available the migration still succeeds; see ADMIN.md §8n for the
-- one-line alternative.
do $$
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;
  perform cron.unschedule('re-charge-site-monitor') where exists (select 1 from cron.job where jobname = 're-charge-site-monitor');
  perform cron.schedule('re-charge-site-monitor', '*/10 * * * *', $job$
    select net.http_post(
      url := 'https://aqwdncyihcbktbbuvvzd.supabase.co/functions/v1/site-monitor',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"source": "cron"}'::jsonb,
      timeout_milliseconds := 55000
    );
  $job$);
  raise notice 'site monitor scheduled every 10 minutes';
exception when others then
  raise notice 'could not schedule the site monitor automatically (%). See ADMIN.md §8n.', sqlerrm;
end $$;
