import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type PasswordRow = {
  id: string;
  status: "启用" | "停用" | null;
  password_hash: string | null;
};

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(APP_SESSION_COOKIE)?.value;
    const payload = verifySessionToken(token);

    if (!payload) {
      throw new Error("登录状态已失效，请重新登录");
    }

    const body = (await request.json()) as {
      currentPassword?: string;
      nextPassword?: string;
    };

    const currentPassword = body.currentPassword?.trim();
    const nextPassword = body.nextPassword?.trim();

    if (!currentPassword) {
      throw new Error("请输入当前密码");
    }

    if (!nextPassword) {
      throw new Error("请输入新密码");
    }

    if (nextPassword.length < 6) {
      throw new Error("新密码长度不能少于6位");
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("system_users")
      .select("id, status, password_hash")
      .eq("id", payload.userId)
      .single();

    if (error) {
      throw error;
    }

    const row = data as PasswordRow;
    if (row.status !== "启用") {
      throw new Error("当前账号已停用");
    }

    if (!verifyPassword(currentPassword, row.password_hash)) {
      throw new Error("当前密码错误");
    }

    const { error: updateError } = await supabase
      .from("system_users")
      .update({
        password_hash: hashPassword(nextPassword),
      })
      .eq("id", row.id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ data: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "密码修改失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
