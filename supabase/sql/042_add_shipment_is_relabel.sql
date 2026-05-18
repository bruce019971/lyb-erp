alter table public.shipment_records
add column if not exists is_relabel text;

comment on column public.shipment_records.is_relabel is '是否换标';
