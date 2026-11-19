begin;

-- Some deployed databases predate migration 065. The overdue filter must run
-- before LIMIT/OFFSET, so ensure its generated column exists here as well.
alter table public.shipment_tracks add column if not exists duration_days integer
  generated always as (warehouse_arrived_time - sailing_time) stored;

-- Preserve the base tables' RLS policies when reading the list view.
create or replace view public.shipment_list_view with (security_invoker = true) as
select s.*, t.estimated_delivery_time,
  coalesce((select jsonb_agg(to_jsonb(r) order by r.delivery_time asc nulls last, r.id)
    from (select id, original_shipment_no, delivery_store, delivery_shipment_no,
      relabel_type, new_ml_code, delivery_time from public.relabel_records
      where btrim(original_shipment_no) = nullif(btrim(s.shipment_no), '')) r), '[]'::jsonb) as relabel_records,
  exists (select 1 from public.relabel_records r
    where btrim(r.original_shipment_no) = nullif(btrim(s.shipment_no), '')) as has_relabel,
  coalesce((select min(r.delivery_time) from public.relabel_records r
    where btrim(r.original_shipment_no) = nullif(btrim(s.shipment_no), '')), s.appointment_time) as effective_appointment_time
from public.shipment_records s
left join public.shipment_tracks t on t.shipment_record_id = s.id;

grant select on public.shipment_list_view to anon, authenticated, service_role;

create index if not exists relabel_records_original_trim_delivery_idx
  on public.relabel_records (btrim(original_shipment_no), delivery_time);
create index if not exists shipment_records_status_created_id_idx
  on public.shipment_records (status, created_at desc nulls last, id);
create index if not exists shipment_tracks_created_id_idx
  on public.shipment_tracks (created_at desc nulls last, id);
create index if not exists shipment_tracks_duration_days_idx
  on public.shipment_tracks (duration_days) where duration_days > 50;

-- Dropdowns need distinct values, not another download of every shipment.
create or replace view public.shipment_track_filter_options with (security_invoker = true) as
select
  coalesce(array_agg(distinct order_store) filter (where order_store is not null), '{}'::text[]) as order_stores,
  coalesce(array_agg(distinct product_name) filter (where product_name is not null), '{}'::text[]) as product_names,
  coalesce(array_agg(distinct logistics_provider) filter (where logistics_provider is not null), '{}'::text[]) as logistics_providers
from public.shipment_records where status = '有效';
grant select on public.shipment_track_filter_options to anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
