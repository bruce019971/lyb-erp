import { NextResponse } from "next/server";

import type { AuthSession } from "@/lib/auth";
import {
  APP_SESSION_COOKIE,
  APP_SESSION_MAX_AGE,
  createSessionToken,
} from "@/lib/app-session";
import { verifyPassword } from "@/lib/password";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase-admin";

type LoginUserRow = {
  id: string;
  username: string;
  nickname: string;
  role_id: string | null;
  status: "启用" | "停用" | null;
  password_hash: string | null;
  role?:
    | {
        role_name: string | null;
        menu_permissions: string[] | null;
      }
    | Array<{
        role_name: string | null;
        menu_permissions: string[] | null;
      }>
    | null;
};

function buildAuthSession(row: LoginUserRow): AuthSession {
  const roleData = Array.isArray(row.role) ? row.role[0] : row.role;
  const menuPermissions = Array.isArray(roleData?.menu_permissions)
    ? roleData.menu_permissions.filter((item): item is string => typeof item === "string")
    : [];

  return {
    userId: row.id,
    username: row.username,
    nickname: row.nickname,
    roleId: row.role_id,
    roleName: roleData?.role_name ?? null,
    menuPermissions,
    loginAt: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };

    const username = body.username?.trim();
    const password = body.password?.trim();

    if (!username) {
      throw new Error("请输入用户账号");
    }

    if (!password) {
      throw new Error("请输入密码");
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("system_users")
      .select(
        "id, username, nickname, role_id, status, password_hash, role:system_roles(role_name, menu_permissions)",
      )
      .eq("username", username)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const row = data as LoginUserRow | null;
    if (!row) {
      throw new Error("用户账号不存在");
    }

    if (row.status !== "启用") {
      throw new Error("该账号已停用");
    }

    if (!verifyPassword(password, row.password_hash)) {
      throw new Error("用户账号或密码错误");
    }

    await createSupabaseAdminClient()
      .from("system_users")
      .update({
        last_login_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    const session = buildAuthSession(row);
    const token = createSessionToken({
      userId: session.userId,
      username: session.username,
    });

    const response = NextResponse.json({ data: session });
    response.cookies.set(APP_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: APP_SESSION_MAX_AGE,
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "登录失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
