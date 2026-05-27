alter table public.logistics_providers
add column if not exists freight_unit_price numeric(12, 2);

comment on column public.logistics_providers.freight_unit_price is '运费单价';
