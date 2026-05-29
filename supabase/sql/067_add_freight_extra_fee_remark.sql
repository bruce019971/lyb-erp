alter table public.freight_records
add column if not exists extra_fee_remark text;

comment on column public.freight_records.extra_fee_remark is '额外费用备注';
