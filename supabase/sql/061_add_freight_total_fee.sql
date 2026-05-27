alter table public.freight_records
add column if not exists total_fee numeric(12, 2);

comment on column public.freight_records.total_fee is '总费用';

update public.freight_records
set total_fee = round(
  (
    freight_unit_price * volume + coalesce(extra_fee, 0)
  )::numeric,
  2
)
where freight_unit_price is not null
  and volume is not null;
