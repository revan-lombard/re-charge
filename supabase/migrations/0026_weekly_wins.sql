-- Re-Charge — the weekly "time saved" email and the "first week" email.
-- weekly-wins runs every morning; it only sends on Mondays (weekly) or 7–13 days
-- after a go-live (first week), and keeps what it sent in settings, so a daily
-- call with no credentials is safe. Same pattern as 0018 (monthly report).
do $$
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;
  perform cron.unschedule('re-charge-weekly-wins') where exists (select 1 from cron.job where jobname = 're-charge-weekly-wins');
  perform cron.schedule('re-charge-weekly-wins', '22 5 * * *', $job$      -- daily, 07:22 SAST
    select net.http_post(
      url := 'https://aqwdncyihcbktbbuvvzd.supabase.co/functions/v1/weekly-wins',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"source": "cron"}'::jsonb,
      timeout_milliseconds := 55000
    );
  $job$);
  raise notice 'weekly wins scheduled daily';
exception when others then
  raise notice 'could not schedule weekly wins automatically (%)', sqlerrm;
end $$;
