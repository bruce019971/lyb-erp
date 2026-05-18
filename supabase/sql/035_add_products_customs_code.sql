alter table public.products
add column if not exists customs_code text;

comment on column public.products.customs_code is '海关编码';
