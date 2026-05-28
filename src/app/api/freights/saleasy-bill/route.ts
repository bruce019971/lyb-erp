import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  SALEASY_COST_LOG_LIST_PATH,
  extractRows,
  getOptionalNumber,
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

type FreightBillRequestBody = {
  freightId?: string;
};

type FreightRow = {
  id: string;
  total_fee: number | null;
  freight_paid_status: string | null;
  shipment:
    | {
        tracking_no: string | null;
        logistics_provider: string | null;
      }
    | Array<{
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

const LOG_SCOPE = "saleasy-bill";

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

function amountsEqual(left: number, right: number) {
  return Math.round(left * 100) === Math.round(right * 100);
}

function extractSaleasyBillAmount(row: unknown) {
  const record = toRecord(row);
  const changeAmount = getOptionalNumber(record?.changeAmount);

  if (changeAmount === undefined) return null;

  return Math.abs(changeAmount);
}

export async function POST(request: Request) {
  try {
    await verifyFreightOperator();

    const body = (await request.json()) as FreightBillRequestBody;
    const freightId = getRequiredText(body.freightId, "缺少运费记录ID");
    const adminClient = createSupabaseAdminClient();
    const { data, error } = await adminClient
      .from("freight_records")
      .select(
        "id, total_fee, freight_paid_status, shipment:shipment_records!inner(tracking_no, logistics_provider)",
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
    const trackingNo = getRequiredText(
      shipment?.tracking_no,
      "当前货件缺少运单编号",
    );

    if (providerName !== "赛易") {
      throw new Error("当前货件不是赛易物流商，不能获取赛易账单");
    }

    if (!isFiniteNumber(freight.total_fee)) {
      throw new Error("当前货件总费用为空，不能获取账单");
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
    const result = await requestSaleasyJson<unknown>({
      baseUrl,
      path: SALEASY_COST_LOG_LIST_PATH,
      token,
      body: {
        businessNo: trackingNo,
      },
      logScope: LOG_SCOPE,
      label: "cost log list response",
      fallbackError: "赛易账单列表查询失败",
    });
    const rows = extractRows(result);
    const row = rows[0] ?? null;
    const billAmount = extractSaleasyBillAmount(row);

    if (!isFiniteNumber(billAmount)) {
      throw new Error("赛易账单中未查询到账单金额");
    }

    const isConsistent = amountsEqual(billAmount, freight.total_fee);
    const { error: updateError } = await adminClient
      .from("freight_records")
      .update({
        bill_amount: billAmount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", freight.id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      billAmount,
      totalFee: freight.total_fee,
      isConsistent,
      matchedCount: rows.length,
      row,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "赛易账单获取失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
