import { supabase } from "@/lib/supabase";

import { buildMenuPermissionSummary } from "../../_components/navigation";
import {
  mockRoleRecords,
  type RoleCreateValues,
  type RoleOption,
  type RoleRecord,
  type RoleUpdateValues,
} from "./roles";

type RoleRequestParams = {
  current?: number;
  pageSize?: number;
} & Record<string, unknown>;

type RoleRow = {
  id: string;
  role_name: string;
  role_code: string;
  data_scope: string | null;
  menu_permissions: string[] | null;
  status: "启用" | "停用" | null;
  created_at: string | null;
  system_users: Array<{ count: number | null }> | null;
};

function generateRoleCode(roleName: string) {
  const normalized = roleName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || `role_${Date.now()}`;
}

function mapRoleRow(row: RoleRow): RoleRecord {
  const menuPermissions = Array.isArray(row.menu_permissions)
    ? row.menu_permissions.filter((item): item is string => typeof item === "string")
    : [];

  return {
    id: row.id,
    role_name: row.role_name,
    role_code: row.role_code,
    data_scope: row.data_scope ?? buildMenuPermissionSummary(menuPermissions),
    menu_permissions: menuPermissions,
    user_count: row.system_users?.[0]?.count ?? 0,
    status: row.status === "停用" ? "停用" : "启用",
    created_at: row.created_at,
  };
}

export async function requestRoleRecords(params: RoleRequestParams) {
  const current = params.current ?? 1;
  const pageSize = params.pageSize ?? 20;
  const from = (current - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("system_roles")
    .select(
      "id, role_name, role_code, data_scope, menu_permissions, status, created_at, system_users(count)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (error) {
    return {
      data: mockRoleRecords,
      success: true,
      total: mockRoleRecords.length,
    };
  }

  return {
    data: ((data ?? []) as RoleRow[]).map(mapRoleRow),
    success: true,
    total: count ?? 0,
  };
}

export async function requestRoleOptions() {
  const { data, error } = await supabase
    .from("system_roles")
    .select("id, role_name")
    .eq("status", "启用")
    .order("created_at", { ascending: true });

  if (error) {
    return mockRoleRecords
      .filter((item) => item.status === "启用")
      .map((item) => ({
        id: item.id,
        role_name: item.role_name,
      })) as RoleOption[];
  }

  return (data ?? []) as RoleOption[];
}

export async function createRoleRecord(values: RoleCreateValues) {
  const menuPermissions = Array.from(
    new Set(values.menu_permissions.filter((item) => typeof item === "string" && item.trim())),
  );

  const payload = {
    role_name: values.role_name.trim(),
    role_code: generateRoleCode(values.role_name),
    data_scope: buildMenuPermissionSummary(menuPermissions),
    menu_permissions: menuPermissions,
    status: values.status,
  };

  const { data, error } = await supabase
    .from("system_roles")
    .insert(payload)
    .select(
      "id, role_name, role_code, data_scope, menu_permissions, status, created_at, system_users(count)",
    )
    .single();

  if (error) {
    throw error;
  }

  return mapRoleRow(data as RoleRow);
}

export async function updateRoleRecord(id: string, values: RoleUpdateValues) {
  const menuPermissions = Array.from(
    new Set(values.menu_permissions.filter((item) => typeof item === "string" && item.trim())),
  );

  const payload = {
    role_name: values.role_name.trim(),
    data_scope: buildMenuPermissionSummary(menuPermissions),
    menu_permissions: menuPermissions,
    status: values.status,
  };

  const { data, error } = await supabase
    .from("system_roles")
    .update(payload)
    .eq("id", id)
    .select(
      "id, role_name, role_code, data_scope, menu_permissions, status, created_at, system_users(count)",
    )
    .single();

  if (error) {
    throw error;
  }

  return mapRoleRow(data as RoleRow);
}

export async function deleteRoleRecord(id: string) {
  const { error } = await supabase.from("system_roles").delete().eq("id", id);

  if (error) {
    throw error;
  }
}
