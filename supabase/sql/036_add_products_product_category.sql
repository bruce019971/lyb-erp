alter table public.products
add column if not exists product_category text;

comment on column public.products.product_category is '产品类别';
