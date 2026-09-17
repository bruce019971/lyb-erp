alter table public.relabel_records
add column if not exists new_ml_code text;

comment on column public.relabel_records.new_ml_code is '新ML Code（产品标、外箱标及产品标必填）';
