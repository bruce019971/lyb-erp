create table if not exists public.shipment_tracks (
  id uuid primary key default gen_random_uuid(),
  shipment_record_id uuid not null unique references public.shipment_records(id) on delete cascade,

  latest_track text,
  track_events jsonb default '[]'::jsonb,
  sailing_time date,
  warehouse_arrived_time date,
  duration_days integer generated always as (warehouse_arrived_time - sailing_time) stored,
  track_updated_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.shipment_tracks is '货件轨迹表';
comment on column public.shipment_tracks.shipment_record_id is '关联货件ID';
comment on column public.shipment_tracks.latest_track is '最新轨迹';
comment on column public.shipment_tracks.track_events is '轨迹明细';
comment on column public.shipment_tracks.sailing_time is '开船时间';
comment on column public.shipment_tracks.warehouse_arrived_time is '到仓时间';
comment on column public.shipment_tracks.duration_days is '时效天数';
comment on column public.shipment_tracks.track_updated_at is '轨迹更新时间';

create index if not exists idx_shipment_tracks_shipment_record_id
on public.shipment_tracks(shipment_record_id);

create index if not exists idx_shipment_tracks_track_updated_at
on public.shipment_tracks(track_updated_at);

drop trigger if exists update_shipment_tracks_updated_at on public.shipment_tracks;

create trigger update_shipment_tracks_updated_at
before update on public.shipment_tracks
for each row
execute function public.update_updated_at_column();

alter table public.shipment_tracks enable row level security;

grant select, insert, update on public.shipment_tracks to anon;

drop policy if exists "Allow anon read shipment tracks" on public.shipment_tracks;
drop policy if exists "Allow anon insert shipment tracks" on public.shipment_tracks;
drop policy if exists "Allow anon update shipment tracks" on public.shipment_tracks;

create policy "Allow anon read shipment tracks"
on public.shipment_tracks
for select
to anon
using (true);

create policy "Allow anon insert shipment tracks"
on public.shipment_tracks
for insert
to anon
with check (true);

create policy "Allow anon update shipment tracks"
on public.shipment_tracks
for update
to anon
using (true)
with check (true);

update public.system_roles
set menu_permissions = (
  select jsonb_agg(distinct permission)
  from jsonb_array_elements_text(
    system_roles.menu_permissions || '["shipment_tracks"]'::jsonb
  ) as permissions(permission)
)
where role_code in ('admin', 'manager')
  and not (menu_permissions ? 'shipment_tracks');
