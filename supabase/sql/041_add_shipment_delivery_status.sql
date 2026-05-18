alter table public.shipment_records
add column if not exists delivery_status text not null default '否';

comment on column public.shipment_records.delivery_status is '是否已送仓';

update public.shipment_records
set delivery_status = '否'
where delivery_status is null;

update public.shipment_records sr
set delivery_status = '是'
from public.relabel_records rr
where rr.original_shipment_no = sr.shipment_no
  and rr.delivery_status = '是';
