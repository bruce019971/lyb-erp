grant update on public.stores to anon;

drop policy if exists "Allow anon update stores" on public.stores;

create policy "Allow anon update stores"
on public.stores
for update
to anon
using (true)
with check (true);
