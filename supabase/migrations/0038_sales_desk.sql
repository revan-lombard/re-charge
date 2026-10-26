-- 0038: the Sales desk researches new prospects on the home PC (ADMIN.md 8dh).
-- Every 15 minutes pg_cron calls the sales-desk function, which researches up to 3 prospects that
-- haven't been yet (reads their website, scores the fit, writes a first message). Nothing is ever sent:
-- the owner reads, edits and sends from the panel. The function throttles itself and only works on
-- prospects already in the pipeline, so calling it costs nothing. Safe to run twice.

-- One run at a time: a run claims its turn here (at most every 9 minutes), so a burst of calls to the
-- function can't start several at once.
create or replace function claim_sales_desk_run() returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into settings (key, value, updated_at) values ('sales_desk_run', jsonb_build_object('at', now()), now())
  on conflict (key) do update set value = excluded.value, updated_at = now()
    where coalesce((settings.value->>'at')::timestamptz, 'epoch'::timestamptz) < now() - interval '9 minutes';
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function claim_sales_desk_run() from public, anon, authenticated;
grant execute on function claim_sales_desk_run() to service_role;

-- The scheduled research waits behind people on the home PC, like the demo builder and Microsoft 365
-- drafts (0036). "Research it now" in the panel (sales-*-now) keeps its place.
create or replace function claim_ai_request() returns setof ai_requests
language sql security definer set search_path = public as $$
  update ai_requests set status = 'working', claimed_at = now()
  where id = (select id from ai_requests where status = 'queued' and expires_at > now() + interval '5 seconds'
              order by (task in ('live-demo', 'inbox-auto-draft', 'sales-score', 'sales-message'))::int, created_at limit 1 for update skip locked)
  returning *;
$$;
revoke all on function claim_ai_request() from public, anon, authenticated;
grant execute on function claim_ai_request() to service_role;
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
