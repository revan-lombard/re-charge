-- Seed data. Run in the Supabase SQL Editor (or via psql) after 0001_init.sql.
-- Safe to run more than once.

-- The first client is Re-Charge itself. New client businesses get their own row.
insert into clients (name, slug) values ('Re-Charge', 're-charge')
on conflict (slug) do nothing;

-- Make yourself Re-Charge staff so you can see every project and payment.
-- First create a login for yourself: Supabase dashboard → Authentication → Users
-- → Add user (your email). Then copy that user's UID and run:
--
--   insert into staff (user_id) values ('PASTE-YOUR-AUTH-USER-UUID')
--   on conflict (user_id) do nothing;
--
-- (Left commented so this file runs cleanly before a user exists.)
