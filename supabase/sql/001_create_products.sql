create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),

  product_name text not null,
  product_url text,
  product_id text,
  sku text,
  ml_code text,
  store_name text,
  product_image_url text,
  product_parameters text,
  packing_list text,
  color_box_size text,
  single_gross_weight numeric(10, 3),
  carton_spec text,
  pcs_per_carton integer default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.products is '产品基础资料表';
comment on column public.products.product_name is '产品名称';
comment on column public.products.product_url is '产品链接';
comment on column public.products.product_id is '产品ID';
comment on column public.products.sku is 'SKU';
comment on column public.products.ml_code is 'ML Code';
comment on column public.products.store_name is '所属店铺';
comment on column public.products.product_image_url is '产品图片URL';
comment on column public.products.product_parameters is '产品参数';
comment on column public.products.packing_list is '包装清单';
comment on column public.products.color_box_size is '彩盒尺寸';
comment on column public.products.single_gross_weight is '单个毛重';
comment on column public.products.carton_spec is '箱规';
comment on column public.products.pcs_per_carton is '装箱数量';

create index if not exists idx_products_product_name
on public.products(product_name);

create index if not exists idx_products_product_id
on public.products(product_id);

create index if not exists idx_products_sku
on public.products(sku);

create index if not exists idx_products_ml_code
on public.products(ml_code);

create index if not exists idx_products_store_name
on public.products(store_name);

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_products_updated_at on public.products;

create trigger update_products_updated_at
before update on public.products
for each row
execute function public.update_updated_at_column();

alter table public.products enable row level security;

grant select on public.products to anon;

drop policy if exists "Allow anon read products" on public.products;

create policy "Allow anon read products"
on public.products
for select
to anon
using (true);
