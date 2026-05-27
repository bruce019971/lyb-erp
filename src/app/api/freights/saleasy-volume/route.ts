import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  SALEASY_TRANSPORT_PLAN_DETAIL_PATH,
  SALEASY_TRANSPORT_PLAN_LIST_PATH,
  extractRows,
  getOptionalNumber,
  getOptionalText,
  getRequiredText,
  logSaleasyResponse,
  loginSaleasy,
  normalizeSaleasyBaseUrl,
  requestSaleasyJson,
  toRecord,
} from "../../shipments/_saleasy";

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
        logistics_provider: string | null;
      }
    | Array<{
        id: string;
        shipment_no: string | null;
        logistics_provider: string | null;
      }>
    | null;
};

type LogisticsProviderRow = {
  system_url: string | null;
  username: string | null;
  password: string | null;
};

type SaleasyVolumeBox = {
  packno: string;
  width: number | null;
  length: number | null;
  height: number | null;
  yjf_weit: number | null;
};

const LOG_SCOPE = "saleasy-volume";
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

function roundVolume(value: number, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getNumber(value: unknown) {
  const numberValue = getOptionalNumber(value);
  return numberValue === undefined ? null : numberValue;
}

function getRequiredNumber(value: unknown, message: string) {
  const numberValue = getNumber(value);

  if (numberValue === null) {
    throw new Error(message);
  }

  return numberValue;
}

function getSaleasyRecordId(value: unknown) {
  const directValue = getOptionalText(value);
  if (directValue) return directValue;

  const record = toRecord(value);
  return getOptionalText(record?.id);
}

function getChargeableVolumeCbm(value: unknown, message: string) {
  const record = toRecord(value);
  const chargeableInfo = toRecord(record?.chargeableInfo);
  const chargeableVolume = getRequiredNumber(
    chargeableInfo?.chargeableVolume,
    message,
  );

  return roundVolume(chargeableVolume / 1_000_000);
}

async function querySaleasyTransportPlan(params: {
  baseUrl: string;
  token: string;
  shipmentNo: string;
}) {
  const payload = {
    searchKey: params.shipmentNo,
  };
  const result = await requestSaleasyJson<unknown>({
    baseUrl: params.baseUrl,
    path: SALEASY_TRANSPORT_PLAN_LIST_PATH,
    token: params.token,
    body: payload,
    logScope: LOG_SCOPE,
    label: "transport plan list response",
    fallbackError: "赛易运输计划列表查询失败",
  });
  const rows = extractRows(result);
  const row = rows[0];
  const transportPlanId = getSaleasyRecordId(row);

  if (!row || !transportPlanId) {
    throw new Error(`赛易未查询到货件 ${params.shipmentNo} 的运输计划`);
  }

  return {
    row,
    rowCount: rows.length,
    transportPlanId,
  };
}

function getPackageOrBoxItems(detail: unknown) {
  const detailRecord = toRecord(detail);
  const transportPlanLogistic = toRecord(detailRecord?.transportPlanLogistic);
  const packageOrBoxItems = transportPlanLogistic?.packageOrBoxItems;

  return Array.isArray(packageOrBoxItems) ? packageOrBoxItems : [];
}

function normalizeSaleasyVolumeBox(value: unknown, index: number): SaleasyVolumeBox {
  const record = toRecord(value);
  const chargeableVolume = getRequiredNumber(
    record?.chargeableVolume,
    `赛易运输计划第 ${index + 1} 箱缺少计费体积`,
  );

  return {
    packno:
      getOptionalText(record?.boxNo) ||
      getOptionalText(record?.selfBoxNo) ||
      getOptionalText(record?.packageNo),
    length: getNumber(record?.length),
    width: getNumber(record?.width),
    height: getNumber(record?.height),
    yjf_weit: roundVolume(chargeableVolume / 1_000_000),
  };
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
        "id, shipment_record_id, shipment:shipment_records!inner(id, shipment_no, logistics_provider)",
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

    if (providerName !== "赛易") {
      throw new Error("当前货件不是赛易物流商，不能获取赛易方数");
    }

    const { data: logisticsData, error: logisticsError } = await adminClient
      .from("logistics_providers")
      .select("system_url, username, password")
      .eq("provider_name", "赛易")
      .single();

    if (logisticsError) {
      throw logisticsError;
    }

    const logisticsProvider = logisticsData as LogisticsProviderRow;
    const baseUrl = normalizeSaleasyBaseUrl(logisticsProvider.system_url);
    const username = getRequiredText(
      logisticsProvider.username,
      "赛易物流商用户名未配置",
    );
    const password = getRequiredText(
      logisticsProvider.password,
      "赛易物流商密码未配置",
    );
    const token = await loginSaleasy({
      baseUrl,
      username,
      password,
      logScope: LOG_SCOPE,
    });
    const transportPlanResult = await querySaleasyTransportPlan({
      baseUrl,
      token,
      shipmentNo,
    });
    const volume = getChargeableVolumeCbm(
      transportPlanResult.row,
      "赛易运输计划未返回总体积",
    );
    const detail = await requestSaleasyJson<unknown>({
      baseUrl,
      path: SALEASY_TRANSPORT_PLAN_DETAIL_PATH,
      token,
      body: { id: transportPlanResult.transportPlanId },
      logScope: LOG_SCOPE,
      label: "transport plan detail response",
      fallbackError: "赛易运输计划详情获取失败",
    });
    const boxes = getPackageOrBoxItems(detail).map(normalizeSaleasyVolumeBox);

    if (!boxes.length) {
      throw new Error("赛易运输计划详情未返回单箱尺寸数据");
    }

    logSaleasyResponse(LOG_SCOPE, "volume boxes parsed", {
      transportPlanId: transportPlanResult.transportPlanId,
      volume,
      matchedCount: boxes.length,
      boxes,
    });

    return NextResponse.json({
      volume,
      matchedCount: boxes.length,
      boxes,
      trackingNo: "",
      waybillId: transportPlanResult.transportPlanId,
      row: transportPlanResult.row,
      detail,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "赛易方数获取失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
