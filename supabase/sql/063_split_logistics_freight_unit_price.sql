alter table public.logistics_providers
add column if not exists general_freight_unit_price numeric(12, 2),
add column if not exists textile_freight_unit_price numeric(12, 2);

comment on column public.logistics_providers.general_freight_unit_price is '普货运费单价';
comment on column public.logistics_providers.textile_freight_unit_price is '纺织品运费单价';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'logistics_providers'
      and column_name = 'freight_unit_price'
  ) then
    update public.logistics_providers
    set general_freight_unit_price = freight_unit_price
    where general_freight_unit_price is null
      and freight_unit_price is not null;

    alter table public.logistics_providers
    drop column if exists freight_unit_price;
  end if;
end $$;
