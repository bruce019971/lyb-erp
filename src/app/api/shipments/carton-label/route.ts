import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fetchShipmentCartonLabel } from "../_carton-label";

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

type CartonLabelRequestBody = {
  shipmentNo?: string;
  boxCount?: string;
  storeId?: string;
  storeAlias?: string;
  storeType?: string | null;
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

function getRequiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

export async function POST(request: Request) {
  try {
    await verifyOperator();

    const body = (await request.json()) as CartonLabelRequestBody;
    const shipmentNo = getRequiredText(body.shipmentNo, "缺少货件号");
    const boxCount = getRequiredText(body.boxCount, "缺少箱数");
    const storeId = getRequiredText(body.storeId, "缺少店铺ID");
    const storeAlias = getRequiredText(body.storeAlias, "缺少店铺别名");
    const storeType =
      typeof body.storeType === "string" ? body.storeType.trim() : null;

    const { buffer, contentType } = await fetchShipmentCartonLabel({
      shipmentNo,
      boxCount,
      storeId,
      storeAlias,
      storeType,
    });

    return new Response(buffer, {
      headers: {
        "content-type": contentType,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "外箱标签下载失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
