create table if not exists public.damage_records (
  id uuid primary key default gen_random_uuid(),
  shipment_record_id uuid references public.shipment_records(id) on delete set null,

  delivery_shipment_no text not null,
  product_name text not null,
  delivery_store text not null,
  delivery_date date not null,
  product_count integer not null,
  damage_count integer not null,
  freight_unit_price numeric(12, 2) not null,
  product_unit_price numeric(12, 2) not null,
  product_value numeric(14, 2) generated always as (
    round(damage_count * product_unit_price, 2)
  ) stored,
  freight_value numeric(14, 2) generated always as (
    round(damage_count * freight_unit_price, 2)
  ) stored,
  total_value numeric(14, 2) generated always as (
    round(damage_count * (product_unit_price + freight_unit_price), 2)
  ) stored,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint damage_records_product_count_check check (product_count > 0),
  constraint damage_records_damage_count_check check (
    damage_count > 0 and damage_count <= product_count
  ),
  constraint damage_records_freight_unit_price_check check (freight_unit_price >= 0),
  constraint damage_records_product_unit_price_check check (product_unit_price >= 0)
);

comment on table public.damage_records is '货损管理表';
comment on column public.damage_records.shipment_record_id is '关联货件ID';
comment on column public.damage_records.delivery_shipment_no is '送仓货件号';
comment on column public.damage_records.product_name is '产品名称';
comment on column public.damage_records.delivery_store is '送仓店铺';
comment on column public.damage_records.delivery_date is '送仓日期';
comment on column public.damage_records.product_count is '产品数量';
comment on column public.damage_records.damage_count is '货损数量';
comment on column public.damage_records.freight_unit_price is '单个运费';
comment on column public.damage_records.product_unit_price is '产品单价';
comment on column public.damage_records.product_value is '产品价值';
comment on column public.damage_records.freight_value is '运费价值';
comment on column public.damage_records.total_value is '总价值';

create index if not exists idx_damage_records_shipment_record_id
on public.damage_records(shipment_record_id);

create index if not exists idx_damage_records_delivery_date
on public.damage_records(delivery_date);

drop trigger if exists update_damage_records_updated_at on public.damage_records;

create trigger update_damage_records_updated_at
before update on public.damage_records
for each row
execute function public.update_updated_at_column();

alter table public.damage_records enable row level security;

grant select, insert on public.damage_records to anon;

drop policy if exists "Allow anon read damage records" on public.damage_records;
drop policy if exists "Allow anon insert damage records" on public.damage_records;

create policy "Allow anon read damage records"
on public.damage_records
for select
to anon
using (true);

create policy "Allow anon insert damage records"
on public.damage_records
for insert
to anon
with check (true);

update public.system_roles
set menu_permissions = (
  select jsonb_agg(distinct permission)
  from jsonb_array_elements_text(
    system_roles.menu_permissions || '["damages"]'::jsonb
  ) as permissions(permission)
)
where role_code in ('admin', 'manager')
  and not (menu_permissions ? 'damages');
