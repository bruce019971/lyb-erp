grant select, update on public.products to anon;

drop policy if exists "Allow anon read products" on public.products;
drop policy if exists "Allow anon update products" on public.products;

create policy "Allow anon read products"
on public.products
for select
to anon
using (true);

create policy "Allow anon update products"
on public.products
for update
to anon
using (true)
with check (true);
