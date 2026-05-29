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

type FreightExtraFeeRequestBody = {
  freightId?: string;
  overwrite?: boolean;
};

type FreightRow = {
  id: string;
  freight_unit_price: number | null;
  volume: number | null;
  extra_fee: number | null;
  freight_paid_status: string | null;
  bill_amount: number | null;
  shipment:
    | {
        shipment_no: string | null;
        tracking_no: string | null;
        logistics_provider: string | null;
      }
    | Array<{
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

const LOG_SCOPE = "saleasy-extra-fee";
const EXTRA_FEE_TYPE = 700;

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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeAmount(value: unknown) {
  return isFiniteNumber(value) ? Math.abs(value) : 0;
}

function amountsEqual(left: number, right: number) {
  return Math.round(left * 100) === Math.round(right * 100);
}

function isZeroAmount(value: number) {
  return amountsEqual(value, 0);
}

function calculateTotalFee(values: {
  freightUnitPrice: number | null;
  volume: number | null;
  extraFee: number;
}) {
  if (!isFiniteNumber(values.freightUnitPrice) || !isFiniteNumber(values.volume)) {
    return null;
  }

  return Number(
    (values.freightUnitPrice * values.volume + values.extraFee).toFixed(2),
  );
}

function getSaleasyRecordId(value: unknown) {
  const directValue = getOptionalText(value);
  if (directValue) return directValue;

  const record = toRecord(value);
  return getOptionalText(record?.id);
}

async function querySaleasyTransportPlan(params: {
  baseUrl: string;
  token: string;
  shipmentNo: string;
}) {
  const result = await requestSaleasyJson<unknown>({
    baseUrl: params.baseUrl,
    path: SALEASY_TRANSPORT_PLAN_LIST_PATH,
    token: params.token,
    body: {
      searchKey: params.shipmentNo,
    },
    logScope: LOG_SCOPE,
    label: "transport plan list response",
    fallbackError: "赛易运输计划列表查询失败",
  });
  const rows = extractRows(result);
  const transportPlanId = getSaleasyRecordId(rows[0]);

  if (!transportPlanId) {
    throw new Error(`赛易未查询到货件 ${params.shipmentNo} 的运输计划`);
  }

  return {
    row: rows[0] ?? null,
    matchedCount: rows.length,
    transportPlanId,
  };
}

function getTransportPlanFeeItems(detail: unknown) {
  const record = toRecord(detail);
  const fee = toRecord(record?.fee);
  return Array.isArray(fee?.fees) ? fee.fees : [];
}

function extractExtraFee(detail: unknown) {
  const matchedItem = getTransportPlanFeeItems(detail).find((item) => {
    const record = toRecord(item);
    return getOptionalNumber(record?.feeType) === EXTRA_FEE_TYPE;
  });
  const matchedRecord = toRecord(matchedItem);
  const amount = getOptionalNumber(matchedRecord?.amount);

  return {
    extraFee: normalizeAmount(amount),
    remark: getOptionalText(matchedRecord?.remark),
    item: matchedItem,
  };
}

export async function POST(request: Request) {
  try {
    await verifyFreightOperator();

    const body = (await request.json()) as FreightExtraFeeRequestBody;
    const freightId = getRequiredText(body.freightId, "缺少运费记录ID");
    const overwrite = body.overwrite === true;
    const adminClient = createSupabaseAdminClient();
    const { data, error } = await adminClient
      .from("freight_records")
      .select(
        "id, freight_unit_price, volume, extra_fee, freight_paid_status, bill_amount, shipment:shipment_records!inner(shipment_no, tracking_no, logistics_provider)",
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
      throw new Error("当前货件不是赛易物流商，不能获取额外费用");
    }

    if (isFiniteNumber(freight.bill_amount)) {
      throw new Error("账单金额已存在，不能获取额外费用");
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
    const detail = await requestSaleasyJson<unknown>({
      baseUrl,
      path: SALEASY_TRANSPORT_PLAN_DETAIL_PATH,
      token,
      body: {
        id: transportPlanResult.transportPlanId,
      },
      logScope: LOG_SCOPE,
      label: "transport plan detail response",
      fallbackError: "赛易运输计划详情查询失败",
    });
    const extraFeeResult = extractExtraFee(detail);

    const currentExtraFee = normalizeAmount(freight.extra_fee);

    if (isZeroAmount(currentExtraFee) && isZeroAmount(extraFeeResult.extraFee)) {
      return NextResponse.json({
        extraFee: extraFeeResult.extraFee,
        extraFeeRemark: extraFeeResult.remark,
        currentExtraFee,
        totalFee: null,
        transportPlanId: transportPlanResult.transportPlanId,
        matchedCount: transportPlanResult.matchedCount,
        requiresOverwrite: false,
        updated: false,
        row: transportPlanResult.row,
        item: extraFeeResult.item,
      });
    }

    if (
      !amountsEqual(currentExtraFee, extraFeeResult.extraFee) &&
      !overwrite
    ) {
      return NextResponse.json({
        extraFee: extraFeeResult.extraFee,
        extraFeeRemark: extraFeeResult.remark,
        currentExtraFee,
        totalFee: null,
        transportPlanId: transportPlanResult.transportPlanId,
        matchedCount: transportPlanResult.matchedCount,
        requiresOverwrite: true,
        updated: false,
        row: transportPlanResult.row,
        item: extraFeeResult.item,
      });
    }

    const totalFee = calculateTotalFee({
      freightUnitPrice: freight.freight_unit_price,
      volume: freight.volume,
      extraFee: extraFeeResult.extraFee,
    });
    const updateValues: {
      extra_fee: number;
      extra_fee_remark: string | null;
      total_fee?: number | null;
      updated_at: string;
    } = {
      extra_fee: extraFeeResult.extraFee,
      extra_fee_remark: extraFeeResult.remark || null,
      updated_at: new Date().toISOString(),
    };

    if (totalFee !== null) {
      updateValues.total_fee = totalFee;
    }

    const { error: updateError } = await adminClient
      .from("freight_records")
      .update(updateValues)
      .eq("id", freight.id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      extraFee: extraFeeResult.extraFee,
      extraFeeRemark: extraFeeResult.remark,
      totalFee,
      transportPlanId: transportPlanResult.transportPlanId,
      matchedCount: transportPlanResult.matchedCount,
      requiresOverwrite: false,
      updated: true,
      row: transportPlanResult.row,
      item: extraFeeResult.item,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "赛易额外费用获取失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
