create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),

  seller_id text not null,
  seller_name text not null,
  seller_address text,
  seller_type text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.stores is '店铺基础资料表';
comment on column public.stores.seller_id is '店铺ID';
comment on column public.stores.seller_name is '店铺名称';
comment on column public.stores.seller_address is '店铺地址';
comment on column public.stores.seller_type is '店铺类型';

create unique index if not exists idx_stores_seller_id_unique
on public.stores(seller_id);

create index if not exists idx_stores_seller_name
on public.stores(seller_name);

create index if not exists idx_stores_seller_type
on public.stores(seller_type);

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_stores_updated_at on public.stores;

create trigger update_stores_updated_at
before update on public.stores
for each row
execute function public.update_updated_at_column();

alter table public.stores enable row level security;

grant select on public.stores to anon;

drop policy if exists "Allow anon read stores" on public.stores;

create policy "Allow anon read stores"
on public.stores
for select
to anon
using (true);
