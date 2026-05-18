alter table public.relabel_records
add column if not exists relabel_fee numeric(12, 2);

comment on column public.relabel_records.relabel_fee is '换标费用';
