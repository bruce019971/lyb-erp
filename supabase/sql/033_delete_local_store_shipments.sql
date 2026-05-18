delete from public.shipment_records sr
where exists (
  select 1
  from public.stores s
  where btrim(s.seller_name) = btrim(sr.order_store)
    and s.seller_type = '本土'
);
