-- Re-Charge admin: post straight to the Facebook Page from the panel (ADMIN.md 8cp).
-- The Page access token is stored encrypted (TOKEN_ENCRYPTION_KEY) and only the
-- facebook-post function (service role) ever decrypts it.

create table if not exists social_accounts (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null unique,                 -- 'facebook'
  page_id       text not null,
  page_name     text,
  token_enc     text not null,                         -- AES-GCM, never sent to the browser
  connected_at  timestamptz not null default now(),
  last_error    text,
  updated_at    timestamptz not null default now()
);
alter table social_accounts enable row level security;
-- staff can see that a Page is connected (name, when); the token column is read only by the function
drop policy if exists social_accounts_staff on social_accounts;
create policy social_accounts_staff on social_accounts for select using (is_staff());
-- the browser may read every column except the token (a column revoke alone does nothing while a
-- table-wide grant exists, so revoke the table and grant the safe columns back)
revoke all on social_accounts from anon, authenticated;
grant select (id, platform, page_id, page_name, connected_at, last_error, updated_at) on social_accounts to authenticated;

alter table posts add column if not exists publish_text  text;      -- the final text, as the panel built it
alter table posts add column if not exists publish_link  text;      -- the final (tracked) link
alter table posts add column if not exists auto_publish  boolean not null default false;  -- post at scheduled_at
alter table posts add column if not exists fb_post_id    text;
alter table posts add column if not exists publish_error text;

-- Publish due Facebook posts every 5 minutes (pg_cron + pg_net). Safe to call: it only
-- posts rows staff marked auto_publish, that are due and not yet posted.
do $$
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;
  perform cron.unschedule('re-charge-facebook-post') where exists (select 1 from cron.job where jobname = 're-charge-facebook-post');
  perform cron.schedule('re-charge-facebook-post', '*/5 * * * *', $job$
    select net.http_post(
      url := 'https://aqwdncyihcbktbbuvvzd.supabase.co/functions/v1/facebook-post',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"action": "due"}'::jsonb,
      timeout_milliseconds := 55000
    );
  $job$);
  raise notice 'facebook posting scheduled every 5 minutes';
exception when others then
  raise notice 'could not schedule facebook posting automatically (%). See ADMIN.md 8cp.', sqlerrm;
end $$;
