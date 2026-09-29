-- Re-Charge — plans can be paid monthly; paying yearly is cheaper (2 months free).
--
--   Hosting R40/month or R400/year · Care R90/month or R900/year ·
--   Business Care R240/month or R2,400/year
--
-- clients.billing says how a client pays; care_amount_cents is the amount per
-- period (R90 for a monthly Care client, R900 for a yearly one). For monthly
-- clients the `care-billing` function (daily, below) emails a card payment link
-- 3 days before care_renews_at, and a paid care payment moves the date on a
-- month instead of a year.

alter table clients add column if not exists billing text not null default 'yearly';
do $$ begin
  alter table clients add constraint clients_billing_check check (billing in ('yearly', 'monthly'));
exception when duplicate_object then null; end $$;

create or replace function payments_side_effects() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  cid uuid := new.client_id;
begin
  if new.status is distinct from 'succeeded' then return new; end if;
  -- only on a new payment, or when an unmatched one gets matched
  if tg_op = 'UPDATE' and (old.project_id is not null or old.client_id is not null) then return new; end if;
  if cid is null and new.project_id is not null then
    select client_id into cid from projects where id = new.project_id;
  end if;

  if new.kind = 'deposit' and new.project_id is not null then
    update projects set deposit_paid = true where id = new.project_id and not deposit_paid;
  end if;

  -- a manual payment settles the matching open link (Yoco closes its own)
  if new.provider <> 'yoco' then
    update payment_requests set status = 'paid', paid_at = coalesce(new.paid_at, now())
    where id = (select id from payment_requests
                where status = 'open' and kind = new.kind and amount_cents = new.amount_cents
                  and ((new.project_id is not null and project_id = new.project_id) or (cid is not null and client_id = cid))
                order by created_at limit 1);
  end if;

  -- a care payment renews the plan: a month for monthly clients, a year for
  -- yearly ones; from the due date if it's recent, from today if it lapsed
  -- long ago. A plan that's already paid well ahead is left alone.
  if new.kind = 'care' and cid is not null then
    update clients set care_active = true,
      care_renews_at = case when billing = 'monthly'
        then ((case when care_renews_at is null or care_renews_at < current_date - 20 then current_date else care_renews_at end) + interval '1 month')::date
        else ((case when care_renews_at is null or care_renews_at < current_date - 60 then current_date else care_renews_at end) + interval '1 year')::date end
    where id = cid and (care_renews_at is null
      or care_renews_at <= current_date + case when billing = 'monthly' then 10 else 90 end);
  end if;
  return new;
end $$;

-- Daily: email this month's payment link to monthly clients who are due.
do $$
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;
  perform cron.unschedule('re-charge-care-billing') where exists (select 1 from cron.job where jobname = 're-charge-care-billing');
  perform cron.schedule('re-charge-care-billing', '37 5 * * *', $job$      -- 07:37 SAST
    select net.http_post(
      url := 'https://aqwdncyihcbktbbuvvzd.supabase.co/functions/v1/care-billing',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"source": "cron"}'::jsonb,
      timeout_milliseconds := 55000
    );
  $job$);
  raise notice 'monthly care billing scheduled daily';
exception when others then
  raise notice 'could not schedule care billing automatically (%)', sqlerrm;
end $$;
