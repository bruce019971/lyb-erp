alter table public.shipment_records
add column if not exists freight_paid_status text default '否';

comment on column public.shipment_records.freight_paid_status is '运费是否支付';
