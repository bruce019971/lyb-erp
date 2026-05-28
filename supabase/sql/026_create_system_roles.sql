create table if not exists public.system_roles (
  id uuid primary key default gen_random_uuid(),
  role_name text not null unique,
  role_code text not null unique,
  data_scope text,
  menu_permissions jsonb not null default '[]'::jsonb,
  status text not null default '启用',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_roles_status_check check (status in ('启用', '停用'))
);

insert into public.system_roles (role_name, role_code, data_scope, menu_permissions, status)
values
  ('系统管理员', 'admin', '全部数据权限', '["core","products","shipments","stores","logistics","relabels","freights","shipment_tracks","system","users","roles"]'::jsonb, '启用'),
  ('普通管理员', 'manager', '业务数据权限', '["core","products","shipments","stores","logistics","relabels","freights","shipment_tracks"]'::jsonb, '启用')
on conflict (role_code) do update
set
  role_name = excluded.role_name,
  data_scope = excluded.data_scope,
  menu_permissions = excluded.menu_permissions,
  status = excluded.status,
  updated_at = now();
