alter table public.shipment_records
add column if not exists warehouse_arrived_status text;

comment on column public.shipment_records.warehouse_arrived_status is '是否到仓';
