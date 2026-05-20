alter table public.shipment_records
add column if not exists order_invoice_url text;

comment on column public.shipment_records.order_invoice_url is '下单发票文件URL';
