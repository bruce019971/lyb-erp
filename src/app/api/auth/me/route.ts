import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type ProfileRow = {
  id: string;
  username: string;
  nickname: string;
  phone: string | null;
  status: "启用" | "停用" | null;
  created_at: string | null;
  last_login_at: string | null;
  password_hash: string | null;
  role?:
    | {
        role_name: string | null;
      }
    | Array<{
        role_name: string | null;
      }>
    | null;
};

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(APP_SESSION_COOKIE)?.value;
  const payload = verifySessionToken(token);

  if (!payload) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("system_users")
    .select(
      "id, username, nickname, phone, status, created_at, last_login_at, password_hash, role:system_roles(role_name)",
    )
    .eq("id", payload.userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = data as ProfileRow | null;
  if (!row || row.status !== "启用") {
    return NextResponse.json({ error: "登录状态已失效" }, { status: 401 });
  }

  const roleData = Array.isArray(row.role) ? row.role[0] : row.role;

  return NextResponse.json({
    data: {
      id: row.id,
      username: row.username,
      nickname: row.nickname,
      phone: row.phone,
      roleName: roleData?.role_name ?? "",
      passwordSet: Boolean(row.password_hash),
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
    },
  });
}
