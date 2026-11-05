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

  if (error || !data) {
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

  if (!permissions.includes("relabels")) {
    throw new Error("当前账号没有换标管理权限");
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
      throw new Error("缺少换标记录ID");
    }

    const adminClient = createSupabaseAdminClient();
    const { data: record, error: recordError } = await adminClient
      .from("relabel_records")
      .select("original_shipment_no")
      .eq("id", id.trim())
      .maybeSingle();

    if (recordError) throw new Error(recordError.message);
    if (!record) {
      return NextResponse.json({ error: "换标记录不存在或已删除，请刷新列表" }, { status: 404 });
    }

    const originalShipmentNo = record.original_shipment_no?.trim();
    if (originalShipmentNo) {
      // 先清空送仓时间，失败时保留换标记录及关联货件号，允许重试删除。
      const { error: shipmentError } = await adminClient
        .from("shipment_records")
        .update({ appointment_time: null, updated_at: new Date().toISOString() })
        .eq("shipment_no", originalShipmentNo)
        .eq("status", "有效");

      if (shipmentError) {
        throw new Error(`清空原货件送仓时间失败，换标记录尚未删除：${shipmentError.message}`);
      }
    }

    const { error } = await adminClient
      .from("relabel_records")
      .delete()
      .eq("id", id.trim());

    if (error) {
      throw new Error(originalShipmentNo
        ? `原货件送仓时间已清空，但换标记录删除失败，请重试：${error.message}`
        : `换标记录删除失败，请重试：${error.message}`);
    }

    return NextResponse.json({ data: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "换标记录删除失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
