alter table public.products
add column if not exists product_english_name text,
add column if not exists product_usage text,
add column if not exists product_attribute text;

comment on column public.products.product_english_name is '产品英文名';
comment on column public.products.product_usage is '用途';
comment on column public.products.product_attribute is '产品属性';
