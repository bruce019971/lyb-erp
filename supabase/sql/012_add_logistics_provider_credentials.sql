alter table public.logistics_providers
add column if not exists username text,
add column if not exists password text;

comment on column public.logistics_providers.username is '用户名';
comment on column public.logistics_providers.password is '密码';
