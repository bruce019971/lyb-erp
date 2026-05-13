grant insert on public.stores to anon;

drop policy if exists "Allow anon insert stores" on public.stores;

create policy "Allow anon insert stores"
on public.stores
for insert
to anon
with check (true);
