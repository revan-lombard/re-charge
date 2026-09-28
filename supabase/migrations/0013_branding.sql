-- Re-Charge — a small public bucket for images that go out in emails
-- (the photo in your email signature). Anyone can view a file by its URL, so
-- email clients can load it; only staff can upload, replace or delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('branding', 'branding', true, 2097152, array['image/png','image/jpeg','image/webp'])
  on conflict (id) do update set public = true;
drop policy if exists branding_objects_staff on storage.objects;
create policy branding_objects_staff on storage.objects for all
  using (bucket_id = 'branding' and is_staff()) with check (bucket_id = 'branding' and is_staff());
