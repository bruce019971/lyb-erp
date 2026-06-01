import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  SALEASY_CONFIRM_PAY_ON_ARRIVAL_PATH,
  SALEASY_TRANSPORT_PLAN_LIST_PATH,
  extractRows,
  getOptionalNumber,
  getOptionalText,
  getRequiredText,
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

type ConfirmTotalFeeRequestBody = {
  freightId?: string;
};

type FreightRow = {
  id: string;
  shipment:
    | {
        shipment_no: string | null;
        logistics_provider: string | null;
      }
    | Array<{
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

const LOG_SCOPE = "saleasy-confirm-total-fee";

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

function normalizeSaleasyFieldKey(key: string) {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function getRecursiveFieldText(
  value: unknown,
  normalizedFieldNames: readonly string[],
  depth = 0,
): string {
  if (!value || depth > 4) return "";

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = getRecursiveFieldText(
        item,
        normalizedFieldNames,
        depth + 1,
      );
      if (result) return result;
    }

    return "";
  }

  const record = toRecord(value);
  if (!record) return "";

  for (const [key, item] of Object.entries(record)) {
    if (!normalizedFieldNames.includes(normalizeSaleasyFieldKey(key))) {
      continue;
    }

    const text = getOptionalText(item);
    if (text) return text;
  }

  for (const item of Object.values(record)) {
    const result = getRecursiveFieldText(
      item,
      normalizedFieldNames,
      depth + 1,
    );
    if (result) return result;
  }

  return "";
}

function normalizeComparableText(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function recordContainsText(value: unknown, keyword: string): boolean {
  const normalizedKeyword = normalizeComparableText(keyword);
  if (!normalizedKeyword) return false;

  if (typeof value === "string" || typeof value === "number") {
    return normalizeComparableText(String(value)).includes(normalizedKeyword);
  }

  if (Array.isArray(value)) {
    return value.some((item) => recordContainsText(item, keyword));
  }

  const record = toRecord(value);
  if (!record) return false;

  return Object.values(record).some((item) => recordContainsText(item, keyword));
}

function findSaleasyTransportPlanRow(rows: unknown[], shipmentNo: string) {
  const normalizedShipmentNo = normalizeComparableText(shipmentNo);
  const matchedByField = rows.find((row) => {
    const shipmentField = getRecursiveFieldText(row, [
      "mcdshipmentid",
      "planname",
      "shipmentno",
    ]);

    return (
      shipmentField &&
      normalizeComparableText(shipmentField) === normalizedShipmentNo
    );
  });

  if (matchedByField) return matchedByField;

  return rows.find((row) => recordContainsText(row, shipmentNo)) ?? rows[0];
}

function getSaleasyPlanValues(row: unknown) {
  const record = toRecord(row);
  const id =
    getRecursiveFieldText(row, ["id", "planid", "transportplanid"]) || "";
  const payFee =
    getOptionalNumber(record?.totalAmount) ??
    getOptionalNumber(record?.payFee) ??
    getOptionalNumber(record?.totalFee);
  const planStatus =
    getOptionalNumber(record?.planStatus) ??
    getOptionalNumber(record?.status) ??
    getOptionalNumber(record?.transportPlanStatus);

  return {
    id,
    payFee,
    planStatus,
  };
}

export async function POST(request: Request) {
  try {
    await verifyFreightOperator();

    const body = (await request.json()) as ConfirmTotalFeeRequestBody;
    const freightId = getRequiredText(body.freightId, "缺少运费记录ID");
    const adminClient = createSupabaseAdminClient();
    const { data, error } = await adminClient
      .from("freight_records")
      .select(
        "id, shipment:shipment_records!inner(shipment_no, logistics_provider)",
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
      throw new Error("当前货件不是赛易物流商，不能确认赛易总费用");
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
    const transportPlanResult = await requestSaleasyJson<unknown>({
      baseUrl,
      path: SALEASY_TRANSPORT_PLAN_LIST_PATH,
      token,
      body: {
        searchKey: shipmentNo,
      },
      logScope: LOG_SCOPE,
      label: "transport plan list response",
      fallbackError: "赛易运输计划列表查询失败",
    });
    const rows = extractRows(transportPlanResult);
    const row = findSaleasyTransportPlanRow(rows, shipmentNo);

    if (!row) {
      throw new Error(`赛易未查询到货件 ${shipmentNo} 的运输计划`);
    }

    const planValues = getSaleasyPlanValues(row);
    const id = getRequiredText(planValues.id, "赛易运输计划缺少ID");

    if (planValues.planStatus !== 80) {
      throw new Error("当前赛易运输计划状态不是待确认总费用");
    }

    if (
      typeof planValues.payFee !== "number" ||
      !Number.isFinite(planValues.payFee)
    ) {
      throw new Error("赛易运输计划缺少总费用");
    }

    await requestSaleasyJson<unknown>({
      baseUrl,
      path: SALEASY_CONFIRM_PAY_ON_ARRIVAL_PATH,
      token,
      body: {
        id,
        payFee: planValues.payFee,
      },
      logScope: LOG_SCOPE,
      label: "confirm pay on arrival response",
      fallbackError: "赛易总费用确认失败",
    });

    return NextResponse.json({
      transportPlanId: id,
      payFee: planValues.payFee,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "赛易总费用确认失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
