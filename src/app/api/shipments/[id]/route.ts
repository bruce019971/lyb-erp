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

type ShipmentRow = {
  id: string;
  delivery_status: string | null;
  warehouse_arrived_status: string | null;
  overseas_warehouse_arrived_at: string | null;
};

function isShipmentLocked(record: ShipmentRow) {
  return (
    record.delivery_status === "是" ||
    record.warehouse_arrived_status === "是" ||
    Boolean(record.overseas_warehouse_arrived_at)
  );
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

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await verifyOperator();
    const { id } = await context.params;

    if (!id?.trim()) {
      throw new Error("缺少货件ID");
    }

    const adminClient = createSupabaseAdminClient();
    const { data: currentShipment, error: currentShipmentError } =
      await adminClient
        .from("shipment_records")
        .select(
          "id, delivery_status, warehouse_arrived_status, overseas_warehouse_arrived_at",
        )
        .eq("id", id.trim())
        .maybeSingle();

    if (currentShipmentError) {
      throw currentShipmentError;
    }

    if (!currentShipment) {
      throw new Error("未找到需要删除的货件");
    }

    if (isShipmentLocked(currentShipment as ShipmentRow)) {
      throw new Error("已到仓的货件不允许修改");
    }

    const { data, error } = await adminClient
      .from("shipment_records")
      .update({
        status: "已删除",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id.trim())
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error("未找到需要删除的货件");
    }

    return NextResponse.json({ data: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "货件删除失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
