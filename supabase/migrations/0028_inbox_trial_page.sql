-- Re-Charge — the Inbox Assistant trial page (trial.html?t=<slug>).
--
-- Instead of connecting a client's Gmail, we give them a private page on re-charge.co.za, set
-- up with their own prices, policies and sign-off. They paste a customer email and get the
-- reply; under each reply they say whether they used it as is, after edits, or not at all.
-- Those clicks are what the trial is measured on, in the same inbox_drafts table (used → sent,
-- edited → sent with lower similarity, not used → discarded), so the panel card, the weekly
-- email and the monthly report count them exactly like a connected inbox.
--
-- provider 'page' marks an account that lives on its page only; inbox-run skips it.
-- Run after 0027.

alter table inbox_accounts add column if not exists slug text;
alter table inbox_accounts add column if not exists page_views integer not null default 0;
create unique index if not exists inbox_accounts_slug on inbox_accounts (slug) where slug is not null;
