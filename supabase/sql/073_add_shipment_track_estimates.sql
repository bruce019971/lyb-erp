begin;

alter table public.shipment_tracks
  add column if not exists estimated_duration_days integer,
  add column if not exists estimated_delivery_time date;

alter table public.shipment_tracks
  drop constraint if exists shipment_tracks_estimated_duration_positive;
alter table public.shipment_tracks
  add constraint shipment_tracks_estimated_duration_positive
  check (estimated_duration_days is null or estimated_duration_days > 0);

comment on column public.shipment_tracks.estimated_duration_days is '预计时效天数，正整数；预计到仓时间由开船时间加此天数计算';
comment on column public.shipment_tracks.estimated_delivery_time is '预计送仓时间，仅清关中可编辑，至少晚于预计到仓时间2天';

create or replace function public.validate_shipment_track_estimates()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  delivery_changed boolean;
begin
  if TG_OP = 'INSERT' then
    delivery_changed := NEW.estimated_delivery_time is not null;
  else
    delivery_changed := NEW.estimated_delivery_time is distinct from OLD.estimated_delivery_time;
  end if;

  if delivery_changed then
    if coalesce(trim(NEW.latest_track), '') <> '清关中'
      or NEW.warehouse_arrived_time is not null
      or NEW.sailing_time is null
      or NEW.estimated_duration_days is null then
      raise exception '仅清关中且已有预计到仓时间的货件可编辑预计送仓时间';
    end if;
    if NEW.estimated_delivery_time is not null
      and (NEW.estimated_delivery_time - NEW.sailing_time)::bigint < NEW.estimated_duration_days::bigint + 2 then
      raise exception '预计送仓时间须至少晚于预计到仓时间2天';
    end if;
  end if;

  -- 开船日期或时效调整后，清空不再满足间隔要求的旧预计送仓时间。
  -- 不阻断物流轨迹同步，也不因清关状态变化删除仍有效的历史预计值。
  if TG_OP = 'UPDATE' and (
    NEW.sailing_time is distinct from OLD.sailing_time
    or NEW.estimated_duration_days is distinct from OLD.estimated_duration_days
  ) and NEW.estimated_delivery_time is not null then
    if NEW.sailing_time is null or NEW.estimated_duration_days is null
      or (NEW.estimated_delivery_time - NEW.sailing_time)::bigint < NEW.estimated_duration_days::bigint + 2 then
      NEW.estimated_delivery_time := null;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists validate_shipment_track_estimates on public.shipment_tracks;
create trigger validate_shipment_track_estimates
before insert or update on public.shipment_tracks
for each row execute function public.validate_shipment_track_estimates();

notify pgrst, 'reload schema';

commit;
