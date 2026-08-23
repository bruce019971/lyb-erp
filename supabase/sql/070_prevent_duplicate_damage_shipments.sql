create or replace function public.prevent_duplicate_damage_shipment_no()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  normalized_shipment_no text := lower(btrim(new.delivery_shipment_no));
begin
  perform pg_advisory_xact_lock(hashtextextended(normalized_shipment_no, 0));

  if exists (
    select 1
    from public.damage_records
    where lower(btrim(delivery_shipment_no)) = normalized_shipment_no
  ) then
    raise exception using
      errcode = '23505',
      message = '送仓货件号已存在货损记录',
      constraint = 'damage_records_delivery_shipment_no_unique';
  end if;

  new.delivery_shipment_no := btrim(new.delivery_shipment_no);
  return new;
end;
$$;

drop trigger if exists prevent_duplicate_damage_shipment_no
on public.damage_records;

create trigger prevent_duplicate_damage_shipment_no
before insert on public.damage_records
for each row
execute function public.prevent_duplicate_damage_shipment_no();
