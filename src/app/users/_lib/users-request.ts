import { supabase } from "@/lib/supabase";
import type { AuthSession } from "@/lib/auth";

import {
  mockUserRecords,
  type UserCreateValues,
  type UserRecord,
  type UserUpdateValues,
} from "./users";

type UserRequestParams = {
  current?: number;
  pageSize?: number;
} & Record<string, unknown>;

type UserRow = {
  id: string;
  username: string;
  nickname: string;
  role_id: string | null;
  phone: string | null;
  email: string | null;
  status: "启用" | "停用" | null;
  created_at: string | null;
  last_login_at: string | null;
  role?:
    | { role_name: string | null }
    | Array<{ role_name: string | null }>
    | null;
};

function normalizeTextValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function requestUserMutation<TResponse>(
  input: Record<string, unknown>,
  init?: RequestInit,
) {
  const response = await fetch("/api/system-users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    ...init,
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: TResponse; error?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error || "请求失败");
  }

  return payload?.data as TResponse;
}

function mapUserRow(row: UserRow): UserRecord {
  const roleName = Array.isArray(row.role)
    ? row.role[0]?.role_name ?? null
    : row.role?.role_name ?? null;

  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    role_id: row.role_id,
    role_name: roleName,
    phone: row.phone,
    email: row.email,
    status: row.status === "停用" ? "停用" : "启用",
    created_at: row.created_at,
    last_login_at: row.last_login_at,
  };
}

export async function requestUserRecords(params: UserRequestParams) {
  const current = params.current ?? 1;
  const pageSize = params.pageSize ?? 20;
  const from = (current - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("system_users")
    .select(
      "id, username, nickname, role_id, phone, email, status, created_at, last_login_at, role:system_roles(role_name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (error) {
    return {
      data: mockUserRecords,
      success: true,
      total: mockUserRecords.length,
    };
  }

  return {
    data: ((data ?? []) as UserRow[]).map(mapUserRow),
    success: true,
    total: count ?? 0,
  };
}

export async function createUserRecord(values: UserCreateValues) {
  const data = await requestUserMutation<UserRow>({
    action: "create",
    values,
  });
  return mapUserRow(data);
}

export async function updateUserRecord(id: string, values: UserUpdateValues) {
  const data = await requestUserMutation<UserRow>({
    action: "update",
    id,
    values,
  });
  return mapUserRow(data);
}

export async function deleteUserRecord(id: string) {
  await requestUserMutation<null>({
    action: "delete",
    id,
  });
}

export async function requestCurrentUserRoleId(username = "lybkj") {
  const { data, error } = await supabase
    .from("system_users")
    .select("role_id")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    const fallback = mockUserRecords.find((item) => item.username === username);
    return fallback?.role_id ?? null;
  }

  return (data?.role_id as string | null | undefined) ?? null;
}

export async function requestLoginUser(username: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: username.trim(),
      password: password.trim(),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: AuthSession; error?: string }
    | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error || "登录失败");
  }

  return payload.data;
}
