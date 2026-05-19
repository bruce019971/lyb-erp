alter table public.stores
add column if not exists seller_alias text;

update public.stores
set seller_alias = seller_name
where seller_alias is null
  and seller_name is not null;
