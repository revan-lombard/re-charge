-- 0038: the Sales desk researches new prospects on the home PC (ADMIN.md 8dh).
-- Every 15 minutes pg_cron calls the sales-desk function, which researches up to 3 prospects that
-- haven't been yet (reads their website, scores the fit, writes a first message). Nothing is ever sent:
-- the owner reads, edits and sends from the panel. The function throttles itself and only works on
-- prospects already in the pipeline, so calling it costs nothing. Safe to run twice.
do $$
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;
  perform cron.unschedule('re-charge-sales-desk') where exists (select 1 from cron.job where jobname = 're-charge-sales-desk');
  perform cron.schedule('re-charge-sales-desk', '*/15 * * * *', $job$
    select net.http_post(
      url := 'https://aqwdncyihcbktbbuvvzd.supabase.co/functions/v1/sales-desk',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"source": "cron"}'::jsonb,
      timeout_milliseconds := 140000
    );
  $job$);
  raise notice 'sales-desk scheduled every 15 minutes';
exception when others then
  raise notice 'could not schedule sales-desk automatically (%)', sqlerrm;
end $$;
