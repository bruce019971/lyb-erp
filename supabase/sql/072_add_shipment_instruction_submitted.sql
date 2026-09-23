begin;

alter table public.shipment_records
add column if not exists instruction_submitted text not null default '否';

comment on column public.shipment_records.instruction_submitted is '是否提交指令';

-- 换标货件的送仓时间优先取换标记录，与货件列表显示规则一致。
create or replace function public.check_shipment_instruction_delivery_time()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.instruction_submitted is distinct from old.instruction_submitted
    and new.appointment_time is null
    and not (
      coalesce(new.is_relabel = '是', false)
      and exists (
        select 1 from public.relabel_records rr
        where rr.original_shipment_no = new.shipment_no
          and rr.delivery_time is not null
      )
    ) then
    raise exception '请先设置送仓时间，再修改是否提交指令';
  end if;
  return new;
end;
$$;

drop trigger if exists check_shipment_instruction_delivery_time
on public.shipment_records;

create trigger check_shipment_instruction_delivery_time
before update of instruction_submitted on public.shipment_records
for each row execute function public.check_shipment_instruction_delivery_time();

-- 一次性补齐本次需求之前已经过送仓日期的有效货件，不包含 2026-09-23 当天。
update public.shipment_records sr
set instruction_submitted = '是'
where sr.status = '有效'
  and sr.instruction_submitted is distinct from '是'
  and case
    when sr.is_relabel = '是' and exists (
      select 1 from public.relabel_records rr
      where rr.original_shipment_no = sr.shipment_no
        and rr.delivery_time is not null
    ) then exists (
      select 1 from public.relabel_records rr
      where rr.original_shipment_no = sr.shipment_no
        and rr.delivery_time < date '2026-09-23'
    )
    else sr.appointment_time::date < date '2026-09-23'
  end;

notify pgrst, 'reload schema';
commit;
