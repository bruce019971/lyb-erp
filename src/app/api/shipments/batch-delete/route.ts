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

export async function POST(request: Request) {
  try {
    await verifyOperator();
    const body = (await request.json()) as { ids?: string[] };
    const ids = Array.isArray(body.ids)
      ? body.ids.map((item) => item.trim()).filter(Boolean)
      : [];

    if (!ids.length) {
      throw new Error("请选择需要删除的货件");
    }

    const adminClient = createSupabaseAdminClient();
    const { data: currentShipments, error: currentShipmentsError } =
      await adminClient
        .from("shipment_records")
        .select(
          "id, delivery_status, warehouse_arrived_status, overseas_warehouse_arrived_at",
        )
        .in("id", ids);

    if (currentShipmentsError) {
      throw currentShipmentsError;
    }

    if (((currentShipments ?? []) as ShipmentRow[]).some(isShipmentLocked)) {
      throw new Error("已到仓的货件不允许修改");
    }

    const { error } = await adminClient
      .from("shipment_records")
      .update({
        status: "已删除",
        updated_at: new Date().toISOString(),
      })
      .in("id", ids);

    if (error) {
      throw error;
    }

    return NextResponse.json({ data: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "货件批量删除失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
