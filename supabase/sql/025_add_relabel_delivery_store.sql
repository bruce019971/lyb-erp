alter table public.relabel_records
add column if not exists delivery_store text;

comment on column public.relabel_records.delivery_store is '送仓店铺';
