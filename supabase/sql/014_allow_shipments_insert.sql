grant insert on public.shipment_records to anon;

drop policy if exists "Allow anon insert shipment records"
on public.shipment_records;

create policy "Allow anon insert shipment records"
on public.shipment_records
for insert
to anon
with check (true);
