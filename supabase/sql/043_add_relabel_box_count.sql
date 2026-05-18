alter table public.relabel_records
add column if not exists box_count integer;

comment on column public.relabel_records.box_count is '外箱数';
