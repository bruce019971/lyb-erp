import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import type { AuthSession } from "@/lib/auth";
import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseServerClient } from "@/lib/supabase-admin";

type SessionUserRow = {
  id: string;
  username: string;
  nickname: string;
  role_id: string | null;
  status: "启用" | "停用" | null;
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

function buildAuthSession(row: SessionUserRow): AuthSession {
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

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(APP_SESSION_COOKIE)?.value;
  const payload = verifySessionToken(token);

  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("system_users")
    .select(
      "id, username, nickname, role_id, status, role:system_roles(role_name, menu_permissions)",
    )
    .eq("id", payload.userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  const row = data as SessionUserRow | null;
  if (!row || row.status !== "启用") {
    return NextResponse.json({ error: "登录状态已失效" }, { status: 401 });
  }

  return NextResponse.json({ data: buildAuthSession(row) });
}
