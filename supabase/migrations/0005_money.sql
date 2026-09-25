-- Re-Charge admin — Phase C (money & clients)
-- Additive only. Payment kinds, manual (EFT) payments, staff-requested Yoco
-- checkouts for any amount, client care-plan pricing, quote line items.

-- payments: what the money was for, and manual entries
alter table payments add column if not exists kind       text not null default 'other';   -- deposit | balance | care | other
alter table payments add column if not exists note       text;
alter table payments add column if not exists client_id  uuid references clients(id) on delete set null;
alter table payments add column if not exists paid_at    timestamptz;
update payments set paid_at = created_at where paid_at is null;
alter table payments alter column paid_at set default now();
update payments set kind = 'deposit' where kind = 'other' and amount_cents = 50000;
drop policy if exists payments_delete on payments;
create policy payments_delete on payments for delete using (is_staff());   -- undo a mistaken manual entry

-- staff-requested checkouts ("Request payment" in the admin)
create table if not exists payment_requests (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references projects(id) on delete set null,
  client_id     uuid references clients(id) on delete set null,
  amount_cents  integer not null check (amount_cents > 0),
  kind          text not null default 'balance',   -- deposit | balance | care | other
  description   text,
  provider      text not null default 'yoco',
  checkout_id   text,
  redirect_url  text,
  status        text not null default 'open',      -- open | paid | cancelled
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);
create index if not exists payment_requests_project_idx on payment_requests (project_id, created_at desc);
alter table payment_requests enable row level security;
drop policy if exists payment_requests_staff on payment_requests;
create policy payment_requests_staff on payment_requests for all using (is_staff()) with check (is_staff());

-- clients: care plan price + free-text notes
alter table clients add column if not exists care_amount_cents integer;
alter table clients add column if not exists notes text;
drop policy if exists clients_delete on clients;
create policy clients_delete on clients for delete using (is_staff());

-- projects: quote line items (the total lives in quote_cents)
alter table projects add column if not exists quote_items jsonb not null default '[]'::jsonb;
