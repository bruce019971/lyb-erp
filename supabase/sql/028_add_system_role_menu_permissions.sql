alter table public.system_roles
add column if not exists menu_permissions jsonb not null default '[]'::jsonb;

update public.system_roles
set menu_permissions = case role_code
  when 'admin' then '["core","products","shipments","stores","logistics","relabels","freights","system","users","roles"]'::jsonb
  when 'manager' then '["core","products","shipments","stores","logistics","relabels","freights"]'::jsonb
  else menu_permissions
end
where coalesce(jsonb_array_length(menu_permissions), 0) = 0;
