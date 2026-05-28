alter table public.shipment_tracks
add column if not exists track_events jsonb default '[]'::jsonb;

comment on column public.shipment_tracks.track_events is '轨迹明细';
