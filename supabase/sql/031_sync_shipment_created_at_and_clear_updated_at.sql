update public.shipment_records
set created_at = coalesce(order_time, created_at),
    updated_at = null
where order_time is not null
   or updated_at is not null;
