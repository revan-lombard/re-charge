-- Re-Charge — prospect finder.
-- A weekly Claude Routine researches local businesses and commits its finds to
-- the repo, encrypted with a public key; the `finder` Edge Function holds the
-- matching private key here and imports the finds as prospects. No policies:
-- only the service role (Edge Functions) can read this table.
create table if not exists private_keys (
  name        text primary key,
  pem         text not null,
  created_at  timestamptz not null default now()
);
alter table private_keys enable row level security;

-- How established a business looks: Google rating and number of reviews, plus
-- a short note on recent activity ("posts weekly on Facebook", "reviews from
-- last month"). activity_score (0–100) is worked out from these; prospects are
-- ranked by fit first, then by how established they are.
alter table projects add column if not exists review_count   integer check (review_count >= 0);
alter table projects add column if not exists rating         numeric(2,1) check (rating between 0 and 5);
alter table projects add column if not exists activity_note  text;
alter table projects add column if not exists activity_score integer check (activity_score between 0 and 100);

-- Import new finds every hour (the Routine runs weekly; this just picks up its
-- file soon after). Fails soft like the site monitor in 0015.
do $$
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;
  perform cron.unschedule('re-charge-finder-pull') where exists (select 1 from cron.job where jobname = 're-charge-finder-pull');
  perform cron.schedule('re-charge-finder-pull', '17 * * * *', $job$
    select net.http_post(
      url := 'https://aqwdncyihcbktbbuvvzd.supabase.co/functions/v1/finder',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"action": "pull"}'::jsonb,
      timeout_milliseconds := 55000
    );
  $job$);
exception when others then
  raise notice 'could not schedule the finder import automatically (%); the panel imports new finds when you open it.', sqlerrm;
end $$;
