begin;

alter table public.shipment_tracks
  alter column estimated_duration_days set default 40;

-- 保留已填写的时效，只补齐未设置的历史记录。
update public.shipment_tracks
set estimated_duration_days = 40
where estimated_duration_days is null;

alter table public.shipment_tracks
  alter column estimated_duration_days set not null;

comment on column public.shipment_tracks.estimated_duration_days is '预计时效天数，默认40天，可修改为正整数；预计到仓时间由开船时间加此天数计算';

notify pgrst, 'reload schema';

commit;
