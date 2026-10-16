-- Re-Charge — fixes from the pre-launch security review. Safe to run more than once, and safe to
-- paste into the Supabase SQL Editor as one block.
--
--   1. Monthly billing can't charge a client twice for the same month (care-billing).
--   2. Only the daily pg_cron job (or a signed-in staff user) can run billing: the job now sends a
--      secret header, kept in Supabase Vault, and the function checks it.
--   3. A website form finds the matching prospect in the database instead of loading every
--      prospect into the function (project-intake).
--
-- Run this BEFORE deploying the updated care-billing and project-intake functions. (The old
-- functions keep working with it; the new care-billing refuses to run without it.)

-- ---------------------------------------------------------------------------------------------
-- 1. One care payment request per client per due date.
--    care-billing claims the month by inserting the request first, with period = the due date
--    (clients.care_renews_at). A second run at the same time hits this unique index (error 23505)
--    and stops before charging or emailing. A request cancelled because its checkout failed
--    doesn't count, so the next day's run can try again.
alter table payment_requests add column if not exists period date;
create unique index if not exists payment_requests_care_once
  on payment_requests (client_id, period)
  where kind = 'care' and period is not null and status <> 'cancelled';

-- ---------------------------------------------------------------------------------------------
-- 2. The billing secret.
--    A long random value is created once in Vault (Project Settings → Vault shows it as
--    care_billing_secret). Nothing secret is written in this file or in git.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'care_billing_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'care_billing_secret',
      'care-billing: the x-billing-secret header the daily pg_cron job sends (0034)');
    raise notice 'care_billing_secret created in Vault';
  else
    raise notice 'care_billing_secret already in Vault: kept';
  end if;
exception when others then
  raise notice 'could not create care_billing_secret in Vault (%). Billing will refuse to run until it exists: see backend notes', sqlerrm;
end $$;

-- care-billing asks the database whether the header it received is the Vault secret.
-- Only the service role (the Edge Function) may call this; it can't be called from a browser.
create or replace function public.care_billing_secret_ok(p_secret text) returns boolean
  language plpgsql stable security definer set search_path = '' as $$
begin
  if p_secret is null or length(p_secret) < 32 then return false; end if;
  return exists (select 1 from vault.decrypted_secrets where name = 'care_billing_secret' and decrypted_secret = p_secret);
exception when others then
  return false;
end $$;
revoke all on function public.care_billing_secret_ok(text) from public;
revoke all on function public.care_billing_secret_ok(text) from anon, authenticated;
grant execute on function public.care_billing_secret_ok(text) to service_role;

-- The daily job (first scheduled in 0019), now sending the secret. The value is read from Vault
-- each time the job runs, so it never appears in cron.job either.
do $$
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;
  perform cron.unschedule('re-charge-care-billing') where exists (select 1 from cron.job where jobname = 're-charge-care-billing');
  perform cron.schedule('re-charge-care-billing', '37 5 * * *', $job$      -- 07:37 SAST
    select net.http_post(
      url := 'https://aqwdncyihcbktbbuvvzd.supabase.co/functions/v1/care-billing',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-billing-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'care_billing_secret'), '')),
      body := '{"source": "cron"}'::jsonb,
      timeout_milliseconds := 55000
    );
  $job$);
  raise notice 'monthly care billing rescheduled daily, with its secret';
exception when others then
  raise notice 'could not reschedule care billing automatically (%)', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 3. Finding the prospect a website form belongs to.
--    Phone numbers compared as digits, with a South African leading 0 as 27 (082… = 2782…), the
--    same rule as normPhone() in project-intake and the panel.
create or replace function public.norm_phone(p text) returns text
  language sql immutable set search_path = '' as $$
  select case when d like '270%' and length(d) = 12 then '27' || substr(d, 4) else d end
  from (select case when d0 like '0%' then '27' || substr(d0, 2) else d0 end as d
        from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d0) a) b
$$;

-- The newest prospect (outreach, not yet a lead) with this email, or failing that this phone.
create or replace function public.find_prospect(p_email text, p_phone text) returns uuid
  language sql stable security definer set search_path = public as $$
  select id from projects
  where status in ('prospect', 'contacted') and spam = false
    and ((coalesce(p_email, '') <> '' and lower(email) = lower(p_email))
      or (length(norm_phone(p_phone)) >= 9 and norm_phone(phone) = norm_phone(p_phone)))
  order by coalesce(coalesce(p_email, '') <> '' and lower(email) = lower(p_email), false) desc, updated_at desc
  limit 1
$$;
revoke all on function public.find_prospect(text, text) from public;
revoke all on function public.find_prospect(text, text) from anon, authenticated;
grant execute on function public.find_prospect(text, text) to service_role;

create index if not exists projects_prospect_email on projects (lower(email)) where status in ('prospect', 'contacted');
create index if not exists projects_prospect_phone on projects (public.norm_phone(phone)) where status in ('prospect', 'contacted');
