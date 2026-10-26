-- 0037: the Inbox Assistant learns how each business replies (ADMIN.md 8dg).
-- inbox_examples keeps real replies the business sent: drafts they marked "sent it as is", replies
-- they pasted on their page to teach it, and (Microsoft 365) what they actually sent after a draft.
-- The newest few go into the next draft's instructions as examples of their tone and length; facts
-- still come only from the business's own facts. The reply text is encrypted (TOKEN_ENCRYPTION_KEY),
-- only the server functions can read it, and at most 20 are kept per business. Deleting the page
-- deletes them (on delete cascade). Safe to run twice.
create table if not exists inbox_examples (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references inbox_accounts(id) on delete cascade,
  draft_id    uuid references inbox_drafts(id) on delete set null,   -- the reply it came from, if any
  source      text not null check (source in ('approved', 'own', 'sent')),
  gist        text,                                                  -- one line: what the customer wanted
  reply_enc   text not null,                                         -- the reply, encrypted
  created_at  timestamptz not null default now()
);
create index if not exists inbox_examples_account on inbox_examples (account_id, created_at desc);
alter table inbox_examples enable row level security;
-- staff can see how many there are and delete them ("Forget them" on the card); only the server reads the text
drop policy if exists inbox_examples_staff_read on inbox_examples;
create policy inbox_examples_staff_read on inbox_examples for select using (is_staff());
drop policy if exists inbox_examples_staff_delete on inbox_examples;
create policy inbox_examples_staff_delete on inbox_examples for delete using (is_staff());
