-- Re-Charge — Google profile care for clients.
--
--   gbp_url      their Google Business Profile (Maps link)
--   gbp_access   whether we can edit it: none | asked | manager | owner
--                (the business owns its profile; we're added as a Manager)
--   gbp_care_at  when we last did the monthly Google care (posts, review
--                replies, photos, suggested edits). Care and Business Care
--                clients show on Today when it's more than a month ago.

alter table clients add column if not exists gbp_url text;
alter table clients add column if not exists gbp_access text not null default 'none';
do $$ begin
  alter table clients add constraint clients_gbp_access_check check (gbp_access in ('none', 'asked', 'manager', 'owner'));
exception when duplicate_object then null; end $$;
alter table clients add column if not exists gbp_care_at timestamptz;
