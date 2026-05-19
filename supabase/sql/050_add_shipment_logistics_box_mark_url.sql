alter table public.shipment_records
add column if not exists logistics_box_mark_url text;

comment on column public.shipment_records.logistics_box_mark_url is '物流箱唛PDF文件URL';
