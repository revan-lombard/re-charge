-- Re-Charge admin: costs (bills and invoices the business pays), read by AI from a PDF, photo or text
-- (ADMIN.md 8ct). The original file is kept in a private "documents" bucket, staff only.
create table if not exists expenses (
  id            uuid primary key default gen_random_uuid(),
  spent_on      date not null default current_date,
  supplier      text not null,
  amount_cents  integer not null check (amount_cents >= 0),     -- the total, VAT included
  vat_cents     integer,                                         -- the VAT in that total, if shown
  currency      text not null default 'ZAR',
  category      text not null default 'other',                   -- hosting | software | ai | marketing | equipment | office | travel | professional | other
  invoice_no    text,
  note          text,
  file_path     text,                                            -- object in bucket "documents"
  read_by       text,                                            -- 'local' | 'claude' | 'manual'
  created_at    timestamptz not null default now()
);
create index if not exists expenses_spent_idx on expenses (spent_on desc);
alter table expenses enable row level security;
drop policy if exists expenses_staff on expenses;
create policy expenses_staff on expenses for all using (is_staff()) with check (is_staff());

-- private bucket for invoices and payment proofs (10 MB, PDFs and images)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf','image/png','image/jpeg','image/webp','image/heic'])
on conflict (id) do nothing;
drop policy if exists documents_objects_staff on storage.objects;
create policy documents_objects_staff on storage.objects for all
  using (bucket_id = 'documents' and is_staff()) with check (bucket_id = 'documents' and is_staff());
