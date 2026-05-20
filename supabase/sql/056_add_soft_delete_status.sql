alter table public.products
add column if not exists status text not null default '有效';

alter table public.shipment_records
add column if not exists status text not null default '有效';

update public.products
set status = '有效'
where status is null;

update public.shipment_records
set status = '有效'
where status is null;

comment on column public.products.status is '状态：有效/已删除';
comment on column public.shipment_records.status is '状态：有效/已删除';

create index if not exists idx_products_status
on public.products(status);

create index if not exists idx_shipment_records_status
on public.shipment_records(status);
