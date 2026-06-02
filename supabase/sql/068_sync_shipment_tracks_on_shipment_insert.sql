create or replace function public.ensure_shipment_track_for_shipment()
returns trigger as $$
begin
  insert into public.shipment_tracks (shipment_record_id)
  values (new.id)
  on conflict (shipment_record_id) do nothing;

  return new;
end;
$$ language plpgsql;

drop trigger if exists ensure_shipment_track_after_insert on public.shipment_records;

create trigger ensure_shipment_track_after_insert
after insert on public.shipment_records
for each row
execute function public.ensure_shipment_track_for_shipment();

insert into public.shipment_tracks (shipment_record_id)
select sr.id
from public.shipment_records sr
where sr.status = '有效'
on conflict (shipment_record_id) do nothing;
