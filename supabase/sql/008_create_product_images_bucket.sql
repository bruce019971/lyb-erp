insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Allow anon read product images" on storage.objects;
drop policy if exists "Allow anon upload product images" on storage.objects;

create policy "Allow anon read product images"
on storage.objects
for select
to anon
using (bucket_id = 'product-images');

create policy "Allow anon upload product images"
on storage.objects
for insert
to anon
with check (bucket_id = 'product-images');
