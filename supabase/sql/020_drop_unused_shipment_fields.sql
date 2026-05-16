alter table public.shipment_records
drop column if exists instruction_submitted,
drop column if exists first_leg_fee_settled,
drop column if exists factory_monthly_settled,
drop column if exists relabel_fee_checked;
