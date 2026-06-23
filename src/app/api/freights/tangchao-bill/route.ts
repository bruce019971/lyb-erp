import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

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
  username: string | null;
  password: string | null;
};

const LOG_SCOPE = "tangchao-bill";
const DEFAULT_TANGCHAO_BASE_URL = "https://wl.tclogx.com";
const TANGCHAO_PROVIDER_NAME = "唐朝";
const TANGCHAO_LOGIN_PATH = "/client/v3/userLogin/login";
const TANGCHAO_BILL_LIST_PATH = "/client/v3/order/headEnd/specialLine/getList";

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
  const roleData = Array.isArray(operator.role) ? operator.role[0] : operator.role;
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

function getOptionalText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function getRequiredText(value: unknown, message: string) {
  const text = getOptionalText(value);

  if (!text) {
    throw new Error(message);
  }

  return text;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  return value as Record<string, unknown>;
}

function getPayloadError(payload: unknown): string {
  const record = toRecord(payload);
  if (!record) return "";

  for (const key of ["message", "msg", "error", "errMsg"]) {
    const text = getOptionalText(record[key]);
    if (text) return text;
  }

  for (const key of ["data", "result"]) {
    const value = record[key];
    const directText = getOptionalText(value);
    if (directText) return directText;

    const nestedError = getPayloadError(value);
    if (nestedError) return nestedError;
  }

  return "";
}

function getPayloadCode(payload: unknown) {
  const record = toRecord(payload);
  if (!record) return null;

  for (const key of ["code", "status", "statusCode"]) {
    const code = record[key];
    if (typeof code === "number" && Number.isFinite(code)) return code;
    if (typeof code === "string" && code.trim()) {
      const parsed = Number(code.trim());
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function isSuccessPayload(payload: unknown, code: number | null) {
  const record = toRecord(payload);

  if (record?.success === false) return false;
  if (record?.success === true) return true;

  return code === null || code === 0 || code === 200;
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;

  const normalized = value.trim().replace(/,/g, "");
  const directValue = Number(normalized);
  if (Number.isFinite(directValue)) return directValue;

  const matched = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!matched) return null;

  const numericValue = Number(matched[0]);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function amountsEqual(left: number, right: number) {
  return Math.round(left * 100) === Math.round(right * 100);
}

function maskSensitiveText(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return "";
  if (trimmed.length <= 8) return "***";

  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function redactTangchaoLogValue(value: unknown, key = ""): unknown {
  const normalizedKey = key.toLowerCase();
  const isSensitiveKey =
    normalizedKey.includes("token") ||
    normalizedKey.includes("secret") ||
    normalizedKey.includes("password") ||
    normalizedKey.includes("key") ||
    normalizedKey === "authorization" ||
    normalizedKey === "cookie";

  if (typeof value === "string") {
    return isSensitiveKey ? maskSensitiveText(value) : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactTangchaoLogValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([itemKey, itemValue]) => [
        itemKey,
        redactTangchaoLogValue(itemValue, itemKey),
      ]),
    );
  }

  return value;
}

function logTangchaoResponse(label: string, values: Record<string, unknown>) {
  console.log(`[${LOG_SCOPE}] ${label}`, redactTangchaoLogValue(values));
}

function joinTangchaoUrl(baseUrl: string, path: string) {
  return new URL(path, `${baseUrl}/`).toString();
}

function extractAuthKey(payload: unknown) {
  const visit = (value: unknown): string => {
    const record = toRecord(value);
    if (!record) return "";

    for (const [key, field] of Object.entries(record)) {
      if (key.toLowerCase() === "authkey") {
        const text = getOptionalText(field);
        if (text) return text;
      }
    }

    for (const field of Object.values(record)) {
      const text = visit(field);
      if (text) return text;
    }

    return "";
  };

  return visit(payload);
}

async function loginTangchao(params: {
  baseUrl: string;
  username: string;
  password: string;
}) {
  const response = await fetch(
    joinTangchaoUrl(params.baseUrl, TANGCHAO_LOGIN_PATH),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username: params.username,
        password: params.password,
        type: 2,
      }),
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => null);
  const payloadCode = getPayloadCode(payload);
  const authKey = extractAuthKey(payload);

  logTangchaoResponse("login response", {
    status: response.status,
    statusText: response.statusText,
    code: payloadCode,
    payload,
    hasAuthKey: Boolean(authKey),
  });

  if (!response.ok || !isSuccessPayload(payload, payloadCode)) {
    throw new Error(
      getPayloadError(payload) ||
        `唐朝登录失败${payloadCode === null ? "" : `，错误码：${payloadCode}`}`,
    );
  }

  return getRequiredText(authKey, "唐朝登录接口未返回authKey");
}

function extractRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  for (const key of ["data", "rows", "records", "list", "items", "result"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;

    const nestedRows = extractRows(value);
    if (nestedRows.length > 0) return nestedRows;
  }

  return [];
}

function normalizeComparableText(value: unknown) {
  return getOptionalText(value).replace(/\s+/g, "").toLowerCase();
}

function recordContainsIdentifier(
  record: unknown,
  identifiers: string[],
  depth = 0,
): boolean {
  if (!record || depth > 5) return false;

  const expectedValues = identifiers
    .map(normalizeComparableText)
    .filter(Boolean);
  if (!expectedValues.length) return false;

  if (Array.isArray(record)) {
    return record.some((item) =>
      recordContainsIdentifier(item, identifiers, depth + 1),
    );
  }

  if (typeof record !== "object") {
    const value = normalizeComparableText(record);
    return expectedValues.some(
      (expected) => value === expected || value.includes(expected),
    );
  }

  return Object.values(record as Record<string, unknown>).some((value) =>
    recordContainsIdentifier(value, identifiers, depth + 1),
  );
}

function extractTangchaoBillAmount(row: unknown) {
  const record = toRecord(row);
  const amount = parseNumber(record?.order_total);

  return amount === null ? null : Math.abs(amount);
}

async function fetchTangchaoBillRows(params: {
  baseUrl: string;
  authKey: string;
  shipmentNo: string;
  trackingNo: string;
}) {
  const identifiers = [params.shipmentNo, params.trackingNo].filter(Boolean);
  const requestBodies = [
    {
      waybill_no: identifiers,
    },
    {
      page: 1,
      pageSize: 100,
      waybill_no: identifiers,
    },
  ];

  for (const body of requestBodies) {
    const response = await fetch(
      joinTangchaoUrl(params.baseUrl, TANGCHAO_BILL_LIST_PATH),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authkey: params.authKey,
        },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
    const payload = await response.json().catch(() => null);
    const payloadCode = getPayloadCode(payload);

    logTangchaoResponse("bill list response", {
      request: body,
      status: response.status,
      statusText: response.statusText,
      code: payloadCode,
      payload,
    });

    if (!response.ok || !isSuccessPayload(payload, payloadCode)) {
      continue;
    }

    const rows = extractRows(payload);
    let matchedRows = rows.filter((row) =>
      recordContainsIdentifier(row, identifiers),
    );

    if (matchedRows.length === 0 && rows.length === 1) {
      matchedRows = rows;
    }

    if (matchedRows.length > 0) {
      return {
        rows,
        matchedRows,
        request: body,
      };
    }
  }

  throw new Error("唐朝订单列表中未匹配到当前货件");
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
        "id, total_fee, freight_paid_status, shipment:shipment_records!inner(shipment_no, tracking_no, logistics_provider)",
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
    const shipmentNo = getOptionalText(shipment?.shipment_no);
    const trackingNo = getRequiredText(
      shipment?.tracking_no,
      "当前货件缺少运单编号",
    );

    if (providerName !== TANGCHAO_PROVIDER_NAME) {
      throw new Error("当前货件不是唐朝物流商，不能获取唐朝账单");
    }

    if (!isFiniteNumber(freight.total_fee)) {
      throw new Error("当前货件总费用为空，不能获取账单");
    }

    const { data: logisticsData, error: logisticsError } = await adminClient
      .from("logistics_providers")
      .select("username, password")
      .eq("provider_name", TANGCHAO_PROVIDER_NAME)
      .single();

    if (logisticsError) {
      throw logisticsError;
    }

    const logisticsProvider = logisticsData as LogisticsProviderRow;
    const username = getRequiredText(
      logisticsProvider.username,
      "唐朝物流商用户名未配置",
    );
    const password = getRequiredText(
      logisticsProvider.password,
      "唐朝物流商密码未配置",
    );
    const authKey = await loginTangchao({
      baseUrl: DEFAULT_TANGCHAO_BASE_URL,
      username,
      password,
    });
    const billResult = await fetchTangchaoBillRows({
      baseUrl: DEFAULT_TANGCHAO_BASE_URL,
      authKey,
      shipmentNo,
      trackingNo,
    });
    const row = billResult.matchedRows[0] ?? null;
    const billAmount = extractTangchaoBillAmount(row);

    if (!isFiniteNumber(billAmount)) {
      throw new Error("唐朝订单列表中未查询到账单金额");
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
      matchedCount: billResult.matchedRows.length,
      row,
      query: {
        path: TANGCHAO_BILL_LIST_PATH,
        request: billResult.request,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "唐朝账单获取失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
