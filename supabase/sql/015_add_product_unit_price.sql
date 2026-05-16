alter table public.products
add column if not exists product_unit_price numeric(12, 2);

comment on column public.products.product_unit_price is '产品单价';
