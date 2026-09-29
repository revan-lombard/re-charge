-- Re-Charge — the Care plan's monthly website report goes out by itself.
--
-- `monthly-report` emails every client on Care or Business Care a short report
-- on the 1st of each month: uptime and average load time from the site
-- monitor, plus visitors and Google searches where Analytics is connected.
-- last_report_at stops a client getting two in one month, so the scheduled
-- call needs no secret. If pg_cron / pg_net aren't available the migration
-- still succeeds; the panel's "Send report now" button works either way.

alter table clients add column if not exists last_report_at timestamptz;

do $$
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;
  perform cron.unschedule('re-charge-monthly-report') where exists (select 1 from cron.job where jobname = 're-charge-monthly-report');
  perform cron.schedule('re-charge-monthly-report', '13 6 1 * *', $job$      -- 1st of the month, 08:13 SAST
    select net.http_post(
      url := 'https://aqwdncyihcbktbbuvvzd.supabase.co/functions/v1/monthly-report',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"source": "cron"}'::jsonb,
      timeout_milliseconds := 55000
    );
  $job$);
  raise notice 'monthly report scheduled for the 1st of each month';
exception when others then
  raise notice 'could not schedule the monthly report automatically (%)', sqlerrm;
end $$;

-- Care plan: the link a client's customers tap to leave them a Google review.
alter table clients add column if not exists google_review_url text;
