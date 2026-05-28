alter table public.shipment_tracks
add column if not exists duration_days integer
generated always as (warehouse_arrived_time - sailing_time) stored;

comment on column public.shipment_tracks.duration_days is '时效天数';
