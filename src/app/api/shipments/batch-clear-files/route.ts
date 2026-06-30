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

type ClearFileField =
  | "carton_label_url"
  | "logistics_box_mark_url"
  | "order_invoice_url";

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

function normalizeIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function normalizeField(value: unknown): ClearFileField {
  if (
    value === "carton_label_url" ||
    value === "logistics_box_mark_url" ||
    value === "order_invoice_url"
  ) {
    return value;
  }

  throw new Error("清理字段不支持");
}

export async function POST(request: Request) {
  try {
    await verifyOperator();

    const body = (await request.json()) as {
      ids?: unknown;
      field?: unknown;
    };
    const ids = normalizeIds(body.ids);
    const field = normalizeField(body.field);

    if (!ids.length) {
      throw new Error("请选择需要处理的货件");
    }

    const adminClient = createSupabaseAdminClient();
    const { data, error } = await adminClient
      .from("shipment_records")
      .update({
        [field]: null,
        updated_at: new Date().toISOString(),
      })
      .eq("status", "有效")
      .in("id", ids)
      .select("id");

    if (error) {
      throw error;
    }

    return NextResponse.json({
      data: {
        count: data?.length ?? 0,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "货件文件清理失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
