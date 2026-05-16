create table if not exists public.system_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  nickname text not null,
  role_id uuid not null references public.system_roles(id),
  phone text,
  email text,
  status text not null default '启用',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_users_status_check check (status in ('启用', '停用'))
);

create index if not exists idx_system_users_role_id on public.system_users(role_id);

insert into public.system_users (username, nickname, role_id, phone, email, status, last_login_at, created_at, updated_at)
select
  'lybkj',
  'Bruce',
  r.id,
  '19925199161',
  null,
  '启用',
  '2026-05-15 07:40:33+08',
  '2024-12-06 08:58:32+08',
  now()
from public.system_roles r
where r.role_code = 'admin'
and not exists (
  select 1 from public.system_users where username = 'lybkj'
);

insert into public.system_users (username, nickname, role_id, phone, email, status, last_login_at, created_at, updated_at)
select
  'lybkjbella',
  'Bella',
  r.id,
  '13750540170',
  null,
  '启用',
  '2026-05-14 22:34:33+08',
  '2024-12-13 21:46:31+08',
  now()
from public.system_roles r
where r.role_code = 'manager'
and not exists (
  select 1 from public.system_users where username = 'lybkjbella'
);
