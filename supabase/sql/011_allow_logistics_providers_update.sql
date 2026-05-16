grant update on public.logistics_providers to anon;

drop policy if exists "Allow anon update logistics providers"
on public.logistics_providers;

create policy "Allow anon update logistics providers"
on public.logistics_providers
for update
to anon
using (true)
with check (true);
