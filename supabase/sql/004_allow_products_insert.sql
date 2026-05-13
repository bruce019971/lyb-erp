grant insert on public.products to anon;

drop policy if exists "Allow anon insert products" on public.products;

create policy "Allow anon insert products"
on public.products
for insert
to anon
with check (true);
