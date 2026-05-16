alter table public.shipment_records
add column if not exists freight_unit_price numeric(12, 2),
add column if not exists volume numeric(12, 3);

comment on column public.shipment_records.freight_unit_price is '运费单价';
comment on column public.shipment_records.volume is '体积';
