alter table public.stores
add column if not exists product_label_unit_price numeric(12, 2),
add column if not exists carton_label_unit_price numeric(12, 2);

comment on column public.stores.product_label_unit_price is '产品标单价';
comment on column public.stores.carton_label_unit_price is '外箱标单价';
