alter table public.freight_records
add column if not exists bill_amount numeric(12, 2);

comment on column public.freight_records.bill_amount is '账单金额';
