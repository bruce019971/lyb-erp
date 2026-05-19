alter table public.logistics_providers
add column if not exists product_label_unit_price numeric(12, 2),
add column if not exists carton_label_unit_price numeric(12, 2);

comment on column public.logistics_providers.product_label_unit_price is '产品标单价';
comment on column public.logistics_providers.carton_label_unit_price is '外箱标单价';

with logistics_price as (
  select
    sr.logistics_provider,
    max(s.product_label_unit_price) as product_label_unit_price,
    max(s.carton_label_unit_price) as carton_label_unit_price
  from public.shipment_records sr
  join public.stores s on s.seller_name = sr.order_store
  where sr.logistics_provider is not null
  group by sr.logistics_provider
)
update public.logistics_providers lp
set
  product_label_unit_price = coalesce(
    lp.product_label_unit_price,
    logistics_price.product_label_unit_price
  ),
  carton_label_unit_price = coalesce(
    lp.carton_label_unit_price,
    logistics_price.carton_label_unit_price
  )
from logistics_price
where lp.provider_name = logistics_price.logistics_provider;

alter table public.stores
drop column if exists product_label_unit_price,
drop column if exists carton_label_unit_price;
