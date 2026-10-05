-- Re-Charge — three-option quotes, a pay-monthly plan, and the client content checklist.
--
-- projects.quote_options: up to three packages the client picks from on the quote
--   page, e.g. [{ key: "a", name: "Quick website", items: [{desc, cents}], recommended,
--   monthly: { cents: 24900, months: 12, afterCents: 10000 } | null }]. Null means a
--   single-price quote, exactly as before. When the client accepts, the `quote`
--   function copies the chosen option into quote_items / quote_cents and records
--   quote_choice, so everything downstream (deposit, balance, Today) is unchanged.
--
-- clients.term_until / term_after_cents: a pay-monthly website. Until term_until the
--   client pays care_amount_cents a month (website + Care); after it, `care-billing`
--   switches them to term_after_cents (Care only) by itself.
--
-- Storage bucket "client-content": logos, photos and price lists the client sends
--   from their quote page after accepting. Private: only the `quote` function (service
--   role) writes, only staff read.

alter table projects add column if not exists quote_options jsonb;
alter table projects add column if not exists quote_choice text;

alter table clients add column if not exists term_until date;
alter table clients add column if not exists term_after_cents integer;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('client-content', 'client-content', false, 6291456, array['image/png','image/jpeg','image/webp','application/pdf'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists client_content_staff on storage.objects;
create policy client_content_staff on storage.objects for all
  using (bucket_id = 'client-content' and is_staff()) with check (bucket_id = 'client-content' and is_staff());
