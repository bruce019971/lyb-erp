alter table public.stores
add column if not exists seller_code text;

comment on column public.stores.seller_code is '店铺Code';

create index if not exists idx_stores_seller_code
on public.stores(seller_code);
