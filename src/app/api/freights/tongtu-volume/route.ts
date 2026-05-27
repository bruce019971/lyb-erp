import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  createTongtuId,
  extractTongtuReceivedChargeWeight,
  extractTongtuVolumeBoxes,
  getOptionalText,
  getRequiredText,
  loginTongtu,
  normalizeBaseUrl,
  queryTongtuWaybill,
} from "../../shipments/_tongtu";

export const runtime = "nodejs";

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
};

type FreightRow = {
  id: string;
  shipment_record_id: string;
  shipment:
    | {
        id: string;
        shipment_no: string | null;
        tracking_no: string | null;
        logistics_provider: string | null;
      }
    | Array<{
        id: string;
        shipment_no: string | null;
        tracking_no: string | null;
        logistics_provider: string | null;
      }>
    | null;
};

type LogisticsProviderRow = {
  system_url: string | null;
  username: string | null;
  password: string | null;
};

const LOG_SCOPE = "tongtu-volume";

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

export async function POST(request: Request) {
  try {
    await verifyFreightOperator();

    const body = (await request.json()) as FreightVolumeRequestBody;
    const freightId = getRequiredText(body.freightId, "缺少运费记录ID");
    const adminClient = createSupabaseAdminClient();
    const { data, error } = await adminClient
      .from("freight_records")
      .select(
        "id, shipment_record_id, shipment:shipment_records!inner(id, shipment_no, tracking_no, logistics_provider)",
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
    const shipmentNo = getRequiredText(
      shipment?.shipment_no,
      "当前货件缺少货件号",
    );
    const trackingNo = getOptionalText(shipment?.tracking_no);

    if (providerName !== "通途") {
      throw new Error("当前货件不是通途物流商，不能获取通途方数");
    }

    const { data: logisticsData, error: logisticsError } = await adminClient
      .from("logistics_providers")
      .select("system_url, username, password")
      .eq("provider_name", "通途")
      .single();

    if (logisticsError) {
      throw logisticsError;
    }

    const logisticsProvider = logisticsData as LogisticsProviderRow;
    const baseUrl = normalizeBaseUrl(logisticsProvider.system_url);
    const username = getRequiredText(
      logisticsProvider.username,
      "通途物流商用户名未配置",
    );
    const password = getRequiredText(
      logisticsProvider.password,
      "通途物流商密码未配置",
    );
    const websocketToken = createTongtuId();
    const visitorId = createTongtuId();
    const token = await loginTongtu({
      baseUrl,
      username,
      password,
      logScope: LOG_SCOPE,
    });
    const queryResult = await queryTongtuWaybill({
      baseUrl,
      token,
      shipmentNo,
      trackingNo,
      websocketToken,
      visitorId,
      logScope: LOG_SCOPE,
      returnMatchedRowWithoutWaybill: true,
    });

    if (!queryResult.row) {
      throw new Error(
        queryResult.error ||
          `通途已下单货件中未找到客户单号为 ${shipmentNo} 的数据`,
      );
    }

    if (!queryResult.matchedShipmentNo) {
      throw new Error(`通途已下单货件中未找到客户单号为 ${shipmentNo} 的数据`);
    }

    const volume = extractTongtuReceivedChargeWeight(queryResult.row);

    if (volume === null) {
      throw new Error("通途货件数据未查询到收货计费重");
    }

    const boxes = extractTongtuVolumeBoxes(queryResult.row);

    return NextResponse.json({
      volume,
      matchedCount: queryResult.matchedCount ?? queryResult.rowCount,
      boxes,
      row: queryResult.row,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "通途方数获取失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
