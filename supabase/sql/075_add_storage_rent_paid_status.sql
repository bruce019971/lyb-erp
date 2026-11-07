begin;

alter table public.shipment_records
add column if not exists storage_rent_paid_status text not null default '否'
  check (storage_rent_paid_status in ('是', '否'));

comment on column public.shipment_records.storage_rent_paid_status is '仓租是否支付，独立于运费支付状态';

notify pgrst, 'reload schema';
commit;
