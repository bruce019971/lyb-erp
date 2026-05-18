create table if not exists public.freight_records (
  id uuid primary key default gen_random_uuid(),
  shipment_record_id uuid not null unique references public.shipment_records(id) on delete cascade,

  freight_unit_price numeric(12, 2),
  volume numeric(12, 3),
  freight_paid_status text default '否',

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.freight_records is '运费管理表';
comment on column public.freight_records.shipment_record_id is '关联货件ID';
comment on column public.freight_records.freight_unit_price is '运费单价';
comment on column public.freight_records.volume is '方数/CBM';
comment on column public.freight_records.freight_paid_status is '是否支付';

create index if not exists idx_freight_records_shipment_record_id
on public.freight_records(shipment_record_id);

drop trigger if exists update_freight_records_updated_at on public.freight_records;

create trigger update_freight_records_updated_at
before update on public.freight_records
for each row
execute function public.update_updated_at_column();

do $$
declare
  has_freight_unit_price boolean;
  has_volume boolean;
  has_freight_paid_status boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'shipment_records'
      and column_name = 'freight_unit_price'
  ) into has_freight_unit_price;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'shipment_records'
      and column_name = 'volume'
  ) into has_volume;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'shipment_records'
      and column_name = 'freight_paid_status'
  ) into has_freight_paid_status;

  execute format(
    'insert into public.freight_records (
      shipment_record_id,
      freight_unit_price,
      volume,
      freight_paid_status,
      created_at,
      updated_at
    )
    select
      id,
      %s,
      %s,
      %s,
      created_at,
      updated_at
    from public.shipment_records
    on conflict (shipment_record_id) do nothing',
    case
      when has_freight_unit_price then 'freight_unit_price'
      else 'null::numeric'
    end,
    case
      when has_volume then 'volume'
      else 'null::numeric'
    end,
    case
      when has_freight_paid_status then 'coalesce(freight_paid_status, ''否'')'
      else '''否''::text'
    end
  );
end $$;

alter table public.shipment_records
drop column if exists freight_unit_price,
drop column if exists volume,
drop column if exists freight_paid_status,
drop column if exists first_leg_unit_cost,
drop column if exists first_leg_batch_fee;

alter table public.freight_records enable row level security;
