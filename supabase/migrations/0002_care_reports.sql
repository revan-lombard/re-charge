-- Re-Charge backend — monthly performance reports
-- Adds the fields the monthly-report function needs: whether a client is on an
-- active hosting/care plan (reports run while true), who to email, and a label
-- for the report header. Safe to run repeatedly.

alter table clients add column if not exists care_active   boolean not null default false;
alter table clients add column if not exists care_plan     text;                       -- 'hosting' | 'care' | 'business' (informational)
alter table clients add column if not exists report_emails text[] not null default '{}';
alter table clients add column if not exists site_label    text;                       -- e.g. "mikesplumbing.co.za" for the report header

-- No new RLS policies needed: clients already has clients_read (staff + own
-- members). These columns are the client's own data; the Edge Functions read
-- and write them with the service role.
