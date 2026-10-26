-- 0039: the Sales desk learns from replies, builds demos for its strongest prospects and writes call
-- notes for the ones that didn't answer (ADMIN.md 8di). Safe to run twice.

-- It now has more to do (a demo is ten answers from the home PC), so it runs every 5 minutes instead of
-- 15. A run lasts at most 150 s, so one turn every 4 minutes still means one run at a time. While the PC
-- is off a run stops straight away, so this costs nothing.
create or replace function claim_sales_desk_run() returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into settings (key, value, updated_at) values ('sales_desk_run', jsonb_build_object('at', now()), now())
  on conflict (key) do update set value = excluded.value, updated_at = now()
    where coalesce((settings.value->>'at')::timestamptz, 'epoch'::timestamptz) < now() - interval '4 minutes';
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function claim_sales_desk_run() from public, anon, authenticated;
grant execute on function claim_sales_desk_run() to service_role;

-- The scheduled call notes wait behind people too (the "-now" ones from the panel keep their place)
create or replace function claim_ai_request() returns setof ai_requests
language sql security definer set search_path = public as $$
  update ai_requests set status = 'working', claimed_at = now()
  where id = (select id from ai_requests where status = 'queued' and expires_at > now() + interval '5 seconds'
              order by (task in ('live-demo', 'inbox-auto-draft', 'sales-score', 'sales-message', 'sales-call'))::int, created_at limit 1 for update skip locked)
  returning *;
$$;
revoke all on function claim_ai_request() from public, anon, authenticated;
grant execute on function claim_ai_request() to service_role;

do $$
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;
  perform cron.unschedule('re-charge-sales-desk') where exists (select 1 from cron.job where jobname = 're-charge-sales-desk');
  perform cron.schedule('re-charge-sales-desk', '*/5 * * * *', $job$
    select net.http_post(
      url := 'https://aqwdncyihcbktbbuvvzd.supabase.co/functions/v1/sales-desk',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"source": "cron"}'::jsonb,
      timeout_milliseconds := 140000
    );
  $job$);
  raise notice 'sales-desk scheduled every 5 minutes';
exception when others then
  raise notice 'could not schedule sales-desk automatically (%)', sqlerrm;
end $$;
