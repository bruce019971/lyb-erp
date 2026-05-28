import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  assertTongtuSuccess,
  buildTongtuHeaders,
  createTongtuId,
  getPayloadError,
  getRequiredText,
  getResponseHeaders,
  joinTongtuUrl,
  logTongtuResponse,
  loginTongtu,
  normalizeBaseUrl,
  type TongtuApiResponse,
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
  system_url: string | null;
  username: string | null;
  password: string | null;
};

const LOG_SCOPE = "tongtu-bill";
const TONGTU_BILL_PATH_CANDIDATES = [
  "/itdida-api/flash/fees/client/receivableFees",
];
const TONGTU_BILL_TABLE_ID_CANDIDATES = [
  "clientFeesTable",
];

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

function getOptionalText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function normalizeComparableText(value: unknown) {
  return getOptionalText(value).replace(/\s+/g, "").toLowerCase();
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

function normalizeFieldName(key: string) {
  return key.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "").toLowerCase();
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

function isFreightFeeTypeRow(row: unknown) {
  if (!row || typeof row !== "object") return false;

  const record = row as Record<string, unknown>;
  const preferredFieldNames = [
    "费用名类型",
    "费用类型",
    "费用名称",
    "费用名",
    "feenametype",
    "feetype",
    "feename",
    "fee",
    "costtype",
    "costname",
    "cost",
    "nametype",
    "name",
    "description",
    "title",
  ];

  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = normalizeFieldName(key);
    if (
      !preferredFieldNames.some(
        (fieldName) => normalizeFieldName(fieldName) === normalizedKey,
      )
    ) {
      continue;
    }

    const text = getOptionalText(value);
    if (text === "运费" || text.includes("运费")) return true;
  }

  return Object.values(record).some((value) => {
    const text = getOptionalText(value);
    return text === "运费" || text.includes("运费");
  });
}

function isBillAmountFieldName(key: string) {
  const normalizedKey = normalizeFieldName(key);
  const preferredFieldNames = [
    "zamt",
    "amount",
    "feeamount",
    "costamount",
    "totalamount",
    "receivableamount",
    "chargeamount",
    "money",
    "total",
    "summaryconversion",
    "amountconversion",
    "totalconversion",
    "receivablefee",
    "receiveamount",
    "originalamount",
    "conversion",
    "summary",
    "summaryamount",
    "feevalue",
    "costvalue",
    "value",
    "price",
    "actualamount",
    "incomeamount",
    "incomeconversion",
    "receivableamountconversion",
    "totalreceivable",
    "subtotal",
    "金额",
    "费用金额",
    "应收金额",
    "账单金额",
    "运费金额",
  ].map(normalizeFieldName);

  return (
    preferredFieldNames.includes(normalizedKey) ||
    normalizedKey.includes("amount") ||
    normalizedKey.includes("money") ||
    normalizedKey.includes("conversion") ||
    normalizedKey.includes("金额")
  );
}

function extractTongtuBillAmount(row: unknown, depth = 0): number | null {
  if (depth > 5) return null;
  if (Array.isArray(row)) {
    for (const item of row) {
      const amount = extractTongtuBillAmount(item, depth + 1);
      if (amount !== null) return amount;
    }

    return null;
  }

  if (!row || typeof row !== "object") return null;

  const record = row as Record<string, unknown>;

  for (const [key, value] of Object.entries(record)) {
    if (!isBillAmountFieldName(key)) continue;

    const amount = parseNumber(value);
    if (amount !== null) return Math.abs(amount);
  }

  for (const value of Object.values(record)) {
    const amount = extractTongtuBillAmount(value, depth + 1);
    if (amount !== null) return amount;
  }

  return null;
}

async function fetchTongtuBillRows(params: {
  baseUrl: string;
  token: string;
  shipmentNo: string;
  trackingNo: string;
  websocketToken: string;
  visitorId: string;
}) {
  const identifiers = [params.shipmentNo, params.trackingNo].filter(Boolean);
  const errors: string[] = [];

  for (const path of TONGTU_BILL_PATH_CANDIDATES) {
    for (const tableId of TONGTU_BILL_TABLE_ID_CANDIDATES) {
      const payload = {
        startRow: 0,
        endRow: 199,
        filterModel: {},
        sortModel: [],
        tableId,
        nos: identifiers,
      };
      const bodyText = JSON.stringify(payload);
      const response = await fetch(joinTongtuUrl(params.baseUrl, path), {
        method: "POST",
        headers: buildTongtuHeaders({
          baseUrl: params.baseUrl,
          token: params.token,
          path,
          bodyText,
          websocketToken: params.websocketToken,
          visitorId: params.visitorId,
          contentType: "application/json",
        }),
        body: bodyText,
      });
      const responseText = await response.text().catch(() => "");
      let result: TongtuApiResponse | null = null;

      try {
        result = responseText ? (JSON.parse(responseText) as TongtuApiResponse) : null;
      } catch {
        result = null;
      }

      logTongtuResponse(LOG_SCOPE, "bill query response", {
        request: payload,
        path,
        status: response.status,
        statusText: response.statusText,
        headers: getResponseHeaders(response),
        payload: result ?? responseText,
      });

      if (!response.ok) {
        errors.push(`${path} ${tableId}: ${getPayloadError(result) || response.status}`);
        continue;
      }

      try {
        assertTongtuSuccess(result, "通途费用对账查询失败");
      } catch (error) {
        errors.push(
          `${path} ${tableId}: ${
            error instanceof Error ? error.message : "通途费用对账查询失败"
          }`,
        );
        continue;
      }

      const rows = extractRows(result);
      let matchedRows = rows.filter(
        (row) =>
          recordContainsIdentifier(row, identifiers) && isFreightFeeTypeRow(row),
      );

      if (matchedRows.length === 0) {
        matchedRows = rows.filter((row) =>
          recordContainsIdentifier(row, identifiers),
        );
      }

      if (matchedRows.length === 0 && rows.length === 1) {
        matchedRows = rows;
      }

      logTongtuResponse(LOG_SCOPE, "bill query matched rows", {
        path,
        tableId,
        rowCount: rows.length,
        matchedRows,
      });

      if (matchedRows.length > 0) {
        return {
          rows,
          matchedRows,
          path,
          tableId,
        };
      }
    }
  }

  throw new Error(
    errors.length
      ? `通途费用对账中未匹配到当前货件的运费数据：${errors.slice(0, 3).join("；")}`
      : "通途费用对账中未匹配到当前货件的运费数据",
  );
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
    const shipmentNo = getRequiredText(
      shipment?.shipment_no,
      "当前货件缺少货件号",
    );
    const trackingNo = getOptionalText(shipment?.tracking_no);

    if (providerName !== "通途") {
      throw new Error("当前货件不是通途物流商，不能获取通途账单");
    }

    if (!isFiniteNumber(freight.total_fee)) {
      throw new Error("当前货件总费用为空，不能获取账单");
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
    const billResult = await fetchTongtuBillRows({
      baseUrl,
      token,
      shipmentNo,
      trackingNo,
      websocketToken,
      visitorId,
    });
    const row = billResult.matchedRows[0] ?? null;
    const billAmount = extractTongtuBillAmount(row);

    if (!isFiniteNumber(billAmount)) {
      throw new Error("通途费用对账中未查询到账单金额");
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
        path: billResult.path,
        tableId: billResult.tableId,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "通途账单获取失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
