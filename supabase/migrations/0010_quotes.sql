-- Re-Charge — quotes the client can view and accept online (/quote?t=<token>).
-- The token is an unguessable random string created in the admin panel; the
-- public `quote` Edge Function looks a project up by it and returns only the
-- quote (never contact details, notes or internal fields).
alter table projects add column if not exists quote_token          text unique;
alter table projects add column if not exists quote_status         text not null default 'none'
  check (quote_status in ('none','sent','viewed','accepted','declined'));
alter table projects add column if not exists quote_sent_at        timestamptz;
alter table projects add column if not exists quote_viewed_at      timestamptz;
alter table projects add column if not exists quote_accepted_at    timestamptz;
alter table projects add column if not exists quote_accepted_name  text;
alter table projects add column if not exists quote_decline_reason text;
alter table projects add column if not exists quote_valid_until    date;
alter table projects add column if not exists quote_timeline       text;   -- shown to the client, e.g. "Live 5 working days after the deposit"
alter table projects add column if not exists quote_notes          text;   -- shown to the client: scope notes, what's excluded
