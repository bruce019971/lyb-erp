import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifySessionToken, APP_SESSION_COOKIE } from "@/lib/app-session";
import { hashPassword } from "@/lib/password";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type UserMutationValues = {
  username?: string;
  nickname?: string;
  phone?: string;
  role_id?: string;
  email?: string;
  password?: string;
};

type LoginOperatorRow = {
  id: string;
  status: "启用" | "停用" | null;
  role:
    | {
        menu_permissions: string[] | null;
      }
    | Array<{
        menu_permissions: string[] | null;
      }>
    | null;
};

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

async function verifyOperator() {
  const cookieStore = await cookies();
  const token = cookieStore.get(APP_SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);

  if (!session) {
    throw new Error("登录状态已失效，请重新登录");
  }

  const adminClient = createSupabaseAdminClient();
  const { data, error } = await adminClient
    .from("system_users")
    .select("id, status, role:system_roles(menu_permissions)")
    .eq("id", session.userId)
    .single();

  if (error) {
    throw new Error("当前登录用户未绑定系统账号");
  }

  const operator = data as LoginOperatorRow;
  const roleData = Array.isArray(operator.role) ? operator.role[0] : operator.role;
  const permissions = Array.isArray(roleData?.menu_permissions)
    ? roleData.menu_permissions
    : [];

  if (operator.status !== "启用") {
    throw new Error("当前登录用户已停用");
  }

  if (!permissions.includes("users")) {
    throw new Error("当前账号没有用户管理权限");
  }

  return {
    systemUserId: operator.id,
  };
}

function buildUserPayload(values: UserMutationValues) {
  const username = values.username?.trim();
  const nickname = values.nickname?.trim();
  const phone = values.phone?.trim();
  const roleId = values.role_id?.trim();

  if (!username) throw new Error("用户账号不能为空");
  if (!nickname) throw new Error("用户昵称不能为空");
  if (!phone) throw new Error("手机号码不能为空");
  if (!roleId) throw new Error("用户类型不能为空");

  return {
    username,
    nickname,
    phone,
    role_id: roleId,
    email: normalizeTextValue(values.email),
  };
}

async function selectUserRow(id: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("system_users")
    .select(
      "id, username, nickname, role_id, phone, email, status, created_at, last_login_at, role:system_roles(role_name)",
    )
    .eq("id", id)
    .single();

  if (error) {
    throw error;
  }

  return data as UserRow;
}

async function handleCreate(values: UserMutationValues) {
  const admin = createSupabaseAdminClient();
  const payload = buildUserPayload(values);
  const password = values.password?.trim();

  if (!password) {
    throw new Error("新增用户时必须填写登录密码");
  }

  const { data, error } = await admin
    .from("system_users")
    .insert({
      ...payload,
      password_hash: hashPassword(password),
    })
    .select(
      "id, username, nickname, role_id, phone, email, status, created_at, last_login_at, role:system_roles(role_name)",
    )
    .single();

  if (error) {
    throw error;
  }

  return data as UserRow;
}

async function handleUpdate(id: string, values: UserMutationValues) {
  const admin = createSupabaseAdminClient();
  const payload = buildUserPayload(values);
  const password = values.password?.trim();

  const updatePayload = password
    ? {
        ...payload,
        password_hash: hashPassword(password),
      }
    : payload;

  const { error } = await admin.from("system_users").update(updatePayload).eq("id", id);

  if (error) {
    throw error;
  }

  return await selectUserRow(id);
}

async function handleDelete(id: string, operatorId: string) {
  if (id === operatorId) {
    throw new Error("不能删除当前登录用户");
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("system_users").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const operator = await verifyOperator();
    const body = (await request.json()) as {
      action?: "create" | "update" | "delete";
      id?: string;
      values?: UserMutationValues;
    };

    if (body.action === "create") {
      const data = await handleCreate(body.values ?? {});
      return NextResponse.json({ data });
    }

    if (body.action === "update") {
      const id = body.id?.trim();
      if (!id) {
        throw new Error("缺少用户ID");
      }

      const data = await handleUpdate(id, body.values ?? {});
      return NextResponse.json({ data });
    }

    if (body.action === "delete") {
      const id = body.id?.trim();
      if (!id) {
        throw new Error("缺少用户ID");
      }

      await handleDelete(id, operator.systemUserId);
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "用户操作失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
