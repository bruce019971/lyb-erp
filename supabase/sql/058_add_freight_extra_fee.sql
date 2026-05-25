alter table public.freight_records
add column if not exists extra_fee numeric(12, 2) default 0;

comment on column public.freight_records.extra_fee is '额外费用';
