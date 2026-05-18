import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type OperatorRow = {
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

  const operator = data as OperatorRow;
  const roleData = Array.isArray(operator.role) ? operator.role[0] : operator.role;
  const permissions = Array.isArray(roleData?.menu_permissions)
    ? roleData.menu_permissions
    : [];

  if (operator.status !== "启用") {
    throw new Error("当前登录用户已停用");
  }

  if (!permissions.includes("shipments")) {
    throw new Error("当前账号没有货件管理权限");
  }
}

export async function POST(request: Request) {
  try {
    await verifyOperator();

    const body = (await request.json()) as Record<string, unknown>;
    const adminClient = createSupabaseAdminClient();
    const { data, error } = await adminClient
      .from("shipment_records")
      .insert(body)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const { error: freightError } = await adminClient
      .from("freight_records")
      .insert({
        shipment_record_id: data.id,
        freight_paid_status: "否",
      });

    if (freightError) {
      await adminClient.from("shipment_records").delete().eq("id", data.id);
      throw freightError;
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "货件新增失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
