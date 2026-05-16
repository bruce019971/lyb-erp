create table if not exists public.logistics_providers (
  id uuid primary key default gen_random_uuid(),

  provider_name text not null,
  system_url text,
  username text,
  password text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.logistics_providers is '物流商基础资料表';
comment on column public.logistics_providers.provider_name is '物流商';
comment on column public.logistics_providers.system_url is '系统链接';
comment on column public.logistics_providers.username is '用户名';
comment on column public.logistics_providers.password is '密码';

create unique index if not exists idx_logistics_providers_provider_name_unique
on public.logistics_providers(provider_name);

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_logistics_providers_updated_at
on public.logistics_providers;

create trigger update_logistics_providers_updated_at
before update on public.logistics_providers
for each row
execute function public.update_updated_at_column();

alter table public.logistics_providers enable row level security;

grant select on public.logistics_providers to anon;

drop policy if exists "Allow anon read logistics providers"
on public.logistics_providers;

create policy "Allow anon read logistics providers"
on public.logistics_providers
for select
to anon
using (true);
