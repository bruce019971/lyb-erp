create table if not exists public.relabel_records (
  id uuid primary key default gen_random_uuid(),

  original_shipment_no text not null,
  delivery_store text,
  delivery_shipment_no text,
  relabel_type text,
  instruction_submitted text default '否',
  delivery_status text default '否',
  delivery_time date,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.relabel_records is '换标管理表';
comment on column public.relabel_records.original_shipment_no is '原货件号';
comment on column public.relabel_records.delivery_store is '送仓店铺';
comment on column public.relabel_records.delivery_shipment_no is '送仓货件号';
comment on column public.relabel_records.relabel_type is '换标类型';
comment on column public.relabel_records.instruction_submitted is '是否提交指令';
comment on column public.relabel_records.delivery_status is '送仓状态';
comment on column public.relabel_records.delivery_time is '送仓时间';

create index if not exists idx_relabel_records_original_shipment_no
on public.relabel_records(original_shipment_no);

create index if not exists idx_relabel_records_delivery_time
on public.relabel_records(delivery_time);

drop trigger if exists update_relabel_records_updated_at on public.relabel_records;

create trigger update_relabel_records_updated_at
before update on public.relabel_records
for each row
execute function public.update_updated_at_column();

alter table public.relabel_records enable row level security;

grant select on public.relabel_records to anon;

drop policy if exists "Allow anon read relabel records" on public.relabel_records;

create policy "Allow anon read relabel records"
on public.relabel_records
for select
to anon
using (true);
