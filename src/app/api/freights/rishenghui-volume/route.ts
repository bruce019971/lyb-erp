import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { syncRishenghuiBoxDimensions } from "../../shipments/_rishenghui";

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

type FreightVolumeRequestBody = {
  freightId?: string;
  accessToken?: string;
};

type FreightRow = {
  id: string;
  shipment_record_id: string;
  shipment:
    | {
        id: string;
        tracking_no: string | null;
        logistics_provider: string | null;
      }
    | Array<{
        id: string;
        tracking_no: string | null;
        logistics_provider: string | null;
      }>
    | null;
};

async function verifyFreightOperator() {
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
  const roleData = Array.isArray(operator.role)
    ? operator.role[0]
    : operator.role;
  const permissions = Array.isArray(roleData?.menu_permissions)
    ? roleData.menu_permissions
    : [];

  if (operator.status !== "启用") {
    throw new Error("当前登录用户已停用");
  }

  if (!permissions.includes("freights")) {
    throw new Error("当前账号没有运费管理权限");
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
    await verifyFreightOperator();

    const body = (await request.json()) as FreightVolumeRequestBody;
    const freightId = getRequiredText(body.freightId, "缺少运费记录ID");
    const accessToken = getRequiredText(body.accessToken, "请先获取日升辉Token");
    const adminClient = createSupabaseAdminClient();
    const { data, error } = await adminClient
      .from("freight_records")
      .select(
        "id, shipment_record_id, shipment:shipment_records!inner(id, tracking_no, logistics_provider)",
      )
      .eq("id", freightId)
      .eq("shipment.status", "有效")
      .single();

    if (error) {
      throw error;
    }

    const freight = data as FreightRow;
    const shipment = Array.isArray(freight.shipment)
      ? freight.shipment[0]
      : freight.shipment;
    const providerName = shipment?.logistics_provider?.trim() || "";
    const trackingNo = shipment?.tracking_no?.trim() || "";

    if (providerName !== "日升辉") {
      throw new Error("当前货件不是日升辉物流商，不能获取日升辉方数");
    }

    if (!trackingNo) {
      throw new Error("当前货件缺少运单编号");
    }

    const dimensionResult = await syncRishenghuiBoxDimensions({
      accessToken,
      trackingNo,
    });

    if (dimensionResult.totalVolume === null) {
      throw new Error("当前运单编号未查询到可计算的单箱方数字段");
    }

    return NextResponse.json({
      volume: dimensionResult.totalVolume,
      matchedCount: dimensionResult.boxes.length,
      boxes: dimensionResult.boxes.map((box) => ({
        packno: box.packno,
        width: box.width,
        length: box.length,
        height: box.height,
        yjf_weit: box.yjf_weit,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "日升辉方数获取失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
