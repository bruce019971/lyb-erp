alter table public.products
add column if not exists product_material text;

comment on column public.products.product_material is '材质';
