alter table public.shipment_records
add column if not exists remark text;

comment on column public.shipment_records.remark is '备注';

alter table public.relabel_records
add column if not exists remark text;

comment on column public.relabel_records.remark is '备注';
