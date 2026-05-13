grant insert on public.logistics_providers to anon;

drop policy if exists "Allow anon insert logistics providers" on public.logistics_providers;

create policy "Allow anon insert logistics providers"
on public.logistics_providers
for insert
to anon
with check (true);
