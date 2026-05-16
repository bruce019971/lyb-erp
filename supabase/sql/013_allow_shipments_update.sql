grant select, update on public.shipment_records to anon;

drop policy if exists "Allow anon read shipment records"
on public.shipment_records;
drop policy if exists "Allow anon update shipment records"
on public.shipment_records;

create policy "Allow anon read shipment records"
on public.shipment_records
for select
to anon
using (true);

create policy "Allow anon update shipment records"
on public.shipment_records
for update
to anon
using (true)
with check (true);
