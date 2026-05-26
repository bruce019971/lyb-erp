import { createHash, createHmac, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { verifyLogisticsOperator } from "../../logistics/rishenghui/_lib";

export const runtime = "nodejs";

type TongtuOrderSubmitRequestBody = {
  shipmentId?: string;
};

type ShipmentRow = {
  id: string;
  logistics_provider: string | null;
  shipment_no: string | null;
  order_invoice_url: string | null;
  tracking_no: string | null;
};

type LogisticsProviderRow = {
  system_url: string | null;
  username: string | null;
  password: string | null;
};

type TongtuApiResponse<T = unknown> = {
  statusCode?: unknown;
  success?: unknown;
  data?: T;
  message?: unknown;
  msg?: unknown;
  error?: unknown;
};

type TongtuOssSts = {
  accessKeyId?: unknown;
  accessSecret?: unknown;
  bucket?: unknown;
  endpoint?: unknown;
  folder?: unknown;
  stsToken?: unknown;
};

type TongtuImportPayload = {
  ossKeys: string[];
  businessType: number;
  createState: number;
  convertOption: number;
  importType: number;
  huoWuTeXingType: number;
  overwriteMode: boolean;
  shouHuoQuDaoMingCheng: string;
  noConfirm: boolean;
  websocketSessionId: string;
  websocketToken: string;
};

const DEFAULT_TONGTU_BASE_URL = "https://szttgj.itdida.com";
const TONGTU_LOGIN_PATH = "/itdida-api/login";
const TONGTU_OSS_STS_PATH = "/itdida-api/flash/oss/sts";
const TONGTU_IMPORT_WAYBILL_PATH =
  "/itdida-api/flash/waybill/controls/importWaybill";
const TONGTU_FETCH_WAYBILL_ROWS_PATH = "/itdida-api/flash/waybill/fetchRows";
const EXCEL_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const TONGTU_DEDICATED_LINE_BUSINESS_TYPE = 2;
const TONGTU_IMPORT_CREATE_NEW = 1;
const TONGTU_CREATE_STATE_PRE_REPORTED = 1;
const TONGTU_DEDICATED_LINE_TABLE_ID = "caoZuoYunDanTable_ke_hu_zx";
const TONGTU_WAYBILL_QUERY_ATTEMPTS = 6;
const TONGTU_WAYBILL_QUERY_DELAY_MS = 2000;

function getRequiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

function getOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getPayloadError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";

  const result = payload as {
    message?: unknown;
    msg?: unknown;
    error?: unknown;
    data?: unknown;
  };

  if (typeof result.message === "string" && result.message.trim()) {
    return result.message.trim();
  }

  if (typeof result.msg === "string" && result.msg.trim()) {
    return result.msg.trim();
  }

  if (typeof result.error === "string" && result.error.trim()) {
    return result.error.trim();
  }

  if (typeof result.data === "string" && result.data.trim()) {
    return result.data.trim();
  }

  return "";
}

function maskSensitiveText(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return "";
  if (trimmed.length <= 8) return "***";

  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function redactTongtuLogValue(value: unknown, key = ""): unknown {
  const normalizedKey = key.toLowerCase();
  const isSensitiveKey =
    normalizedKey.includes("token") ||
    normalizedKey.includes("secret") ||
    normalizedKey.includes("password") ||
    normalizedKey === "authorization";

  if (typeof value === "string") {
    return isSensitiveKey ? maskSensitiveText(value) : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactTongtuLogValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([itemKey, itemValue]) => [
        itemKey,
        redactTongtuLogValue(itemValue, itemKey),
      ]),
    );
  }

  return value;
}

function getResponseHeaders(response: Response) {
  return Object.fromEntries(response.headers.entries());
}

function logTongtuResponse(label: string, values: Record<string, unknown>) {
  console.log(`[tongtu-order-submit] ${label}`, redactTongtuLogValue(values));
}

function assertTongtuSuccess(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    throw new Error(fallback);
  }

  const result = payload as TongtuApiResponse;
  const statusCode =
    typeof result.statusCode === "number"
      ? result.statusCode
      : typeof result.statusCode === "string"
        ? Number(result.statusCode)
        : undefined;

  if (result.success === false || (statusCode !== undefined && statusCode !== 200)) {
    throw new Error(getPayloadError(payload) || fallback);
  }
}

function normalizeBaseUrl(systemUrl?: string | null) {
  const fallback = DEFAULT_TONGTU_BASE_URL;
  const rawUrl = systemUrl?.trim() || fallback;
  const withProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return fallback;
  }
}

function joinTongtuUrl(baseUrl: string, path: string) {
  return new URL(path, `${baseUrl}/`).toString();
}

function createId() {
  return randomUUID().replace(/-/g, "");
}

function md5(value: string) {
  return createHash("md5").update(value).digest("hex");
}

function getSubdomain(baseUrl: string) {
  const hostname = new URL(baseUrl).hostname;
  const parts = hostname.split(".");

  if (parts.length <= 2) return "";

  return parts[0] || "";
}

function buildTongtuChecksum(params: {
  baseUrl: string;
  bodyText: string;
  path: string;
  query?: string;
  visitorId: string;
}) {
  const bodyDigest = md5(params.bodyText);
  const visitorDigest = md5(`/${getSubdomain(params.baseUrl)}|${params.visitorId}`);
  const checksumSource =
    bodyDigest.substring(2) +
    visitorDigest.substring(0) +
    bodyDigest.substring(2) +
    visitorDigest.substring(3) +
    params.path +
    (params.query || "");

  return md5(checksumSource);
}

function buildTongtuHeaders(params: {
  baseUrl: string;
  token: string;
  path: string;
  bodyText?: string;
  websocketToken: string;
  visitorId: string;
  contentType?: string;
}) {
  const bodyText = params.bodyText ?? "";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.token}`,
    d: buildTongtuChecksum({
      baseUrl: params.baseUrl,
      bodyText,
      path: params.path,
      visitorId: params.visitorId,
    }),
    i: params.visitorId,
    w: params.websocketToken,
  };

  if (params.contentType) {
    headers["content-type"] = params.contentType;
  }

  return headers;
}

async function loginTongtu(params: {
  baseUrl: string;
  username: string;
  password: string;
}) {
  const response = await fetch(joinTongtuUrl(params.baseUrl, TONGTU_LOGIN_PATH), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: new URLSearchParams({
      username: params.username,
      password: params.password,
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | TongtuApiResponse<string>
    | null;
  logTongtuResponse("login response", {
    status: response.status,
    statusText: response.statusText,
    headers: getResponseHeaders(response),
    payload: payload
      ? {
          ...payload,
          data: typeof payload.data === "string" ? maskSensitiveText(payload.data) : payload.data,
        }
      : payload,
  });

  if (!response.ok) {
    throw new Error(getPayloadError(payload) || "通途登录失败");
  }

  assertTongtuSuccess(payload, "通途登录失败");

  const token = getRequiredText(payload?.data, "通途登录接口未返回Token");
  return token;
}

async function getTongtuOssSts(params: {
  baseUrl: string;
  token: string;
  websocketToken: string;
  visitorId: string;
}) {
  const response = await fetch(joinTongtuUrl(params.baseUrl, TONGTU_OSS_STS_PATH), {
    method: "GET",
    headers: buildTongtuHeaders({
      baseUrl: params.baseUrl,
      token: params.token,
      path: TONGTU_OSS_STS_PATH,
      websocketToken: params.websocketToken,
      visitorId: params.visitorId,
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | TongtuApiResponse<TongtuOssSts>
    | null;
  logTongtuResponse("oss sts response", {
    status: response.status,
    statusText: response.statusText,
    headers: getResponseHeaders(response),
    payload,
  });

  if (!response.ok) {
    throw new Error(getPayloadError(payload) || "通途OSS临时凭证获取失败");
  }

  assertTongtuSuccess(payload, "通途OSS临时凭证获取失败");

  if (!payload?.data) {
    throw new Error("通途OSS临时凭证为空");
  }

  return payload.data;
}

function normalizeOssEndpoint(endpoint: string) {
  const value = endpoint.trim().replace(/\/+$/, "");

  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    return {
      protocol: url.protocol,
      host: url.host,
    };
  }

  return {
    protocol: "https:",
    host: value,
  };
}

function encodeOssObjectKey(objectKey: string) {
  return objectKey.split("/").map(encodeURIComponent).join("/");
}

function signOssPutRequest(params: {
  accessSecret: string;
  bucket: string;
  contentType: string;
  date: string;
  objectKey: string;
  stsToken: string;
}) {
  const canonicalizedOssHeaders = `x-oss-security-token:${params.stsToken}\n`;
  const canonicalizedResource = `/${params.bucket}/${params.objectKey}`;
  const stringToSign =
    `PUT\n\n${params.contentType}\n${params.date}\n` +
    canonicalizedOssHeaders +
    canonicalizedResource;
  const signature = createHmac("sha1", params.accessSecret)
    .update(stringToSign)
    .digest("base64");

  return signature;
}

async function uploadTongtuOssFile(params: {
  sts: TongtuOssSts;
  buffer: ArrayBuffer;
}) {
  const accessKeyId = getRequiredText(
    params.sts.accessKeyId,
    "通途OSS临时凭证缺少accessKeyId",
  );
  const accessSecret = getRequiredText(
    params.sts.accessSecret,
    "通途OSS临时凭证缺少accessSecret",
  );
  const bucket = getRequiredText(params.sts.bucket, "通途OSS临时凭证缺少bucket");
  const endpoint = getRequiredText(
    params.sts.endpoint,
    "通途OSS临时凭证缺少endpoint",
  );
  const folder = getRequiredText(params.sts.folder, "通途OSS临时凭证缺少folder");
  const stsToken = getRequiredText(
    params.sts.stsToken,
    "通途OSS临时凭证缺少stsToken",
  );
  const normalizedFolder = folder.endsWith("/") ? folder : `${folder}/`;
  const objectName = `${createId()}.xlsx`;
  const objectKey = `${normalizedFolder}${objectName}`;
  const date = new Date().toUTCString();
  const { protocol, host } = normalizeOssEndpoint(endpoint);
  const signature = signOssPutRequest({
    accessSecret,
    bucket,
    contentType: EXCEL_CONTENT_TYPE,
    date,
    objectKey,
    stsToken,
  });
  const uploadUrl = `${protocol}//${bucket}.${host}/${encodeOssObjectKey(
    objectKey,
  )}`;
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `OSS ${accessKeyId}:${signature}`,
      "content-type": EXCEL_CONTENT_TYPE,
      Date: date,
      "x-oss-security-token": stsToken,
    },
    body: params.buffer,
  });
  const responseText = await response.text().catch(() => "");
  logTongtuResponse("oss upload response", {
    status: response.status,
    statusText: response.statusText,
    headers: getResponseHeaders(response),
    body: responseText,
    objectKey,
    importKey: `7d/${objectName}`,
  });

  if (!response.ok) {
    const detail = responseText;
    throw new Error(
      detail.trim()
        ? `通途发票上传OSS失败：${detail.trim().slice(0, 300)}`
        : "通途发票上传OSS失败",
    );
  }

  return {
    objectKey,
    importKey: `7d/${objectName}`,
  };
}

function normalizeTrackingKey(key: string) {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function normalizeTongtuFieldKey(key: string) {
  const normalized = normalizeTrackingKey(key);
  return normalized.endsWith("normalize")
    ? normalized.slice(0, -"normalize".length)
    : normalized;
}

function isTrackingFieldName(key: string) {
  const normalized = normalizeTongtuFieldKey(key);
  return (
    [
      "packno",
      "packnumber",
      "carrierbillno",
      "carriertrackingno",
      "carrierwaybillno",
      "trackingno",
      "trackingnumber",
      "waybillno",
      "waybillnumber",
      "ordertrackingno",
      "billno",
      "yundanhao",
      "zhuandanhao",
      "transferno",
      "seventeenno",
      "xitongdanhao",
      "systembillno",
      "systemno",
      "systemorderno",
      "masterbillnoair",
      "masterbillnosea",
    ].includes(normalized) ||
    key.includes("运单号") ||
    key.includes("系统单号") ||
    key.includes("转单号")
  );
}

function normalizeTrackingValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function normalizeComparableText(value: unknown) {
  return normalizeTrackingValue(value).replace(/\s+/g, "").toLowerCase();
}

function isShipmentNoFieldName(key: string) {
  const normalized = normalizeTongtuFieldKey(key);
  return (
    [
      "kehudanhao",
      "clientbillno",
      "clientorderno",
      "origclientno",
      "originalclientno",
      "clientno",
      "customerno",
      "customerorderno",
      "shipmentno",
      "bookingno",
      "referenceno",
      "refno",
      "fbano",
    ].includes(normalized) ||
    key.includes("客户单号") ||
    key.includes("货件号") ||
    key.includes("订单号") ||
    key.includes("参考号")
  );
}

function recordMatchesShipmentNo(
  record: unknown,
  shipmentNo: string,
  depth = 0,
): boolean {
  if (!record || depth > 4) return false;

  const expected = normalizeComparableText(shipmentNo);
  if (!expected) return false;

  if (Array.isArray(record)) {
    return record.some((item) =>
      recordMatchesShipmentNo(item, shipmentNo, depth + 1),
    );
  }

  if (typeof record !== "object") {
    return normalizeComparableText(record) === expected;
  }

  const values = record as Record<string, unknown>;

  for (const [key, value] of Object.entries(values)) {
    if (!isShipmentNoFieldName(key)) continue;
    if (normalizeComparableText(value) === expected) return true;
  }

  return Object.values(values).some((value) =>
    recordMatchesShipmentNo(value, shipmentNo, depth + 1),
  );
}

function extractTrackingNo(value: unknown, depth = 0): string {
  if (!value || depth > 6) return "";

  if (Array.isArray(value)) {
    for (const item of value) {
      const trackingNo = extractTrackingNo(item, depth + 1);
      if (trackingNo) return trackingNo;
    }
    return "";
  }

  if (typeof value !== "object") return "";

  const record = value as Record<string, unknown>;

  for (const [key, item] of Object.entries(record)) {
    if (!isTrackingFieldName(key)) continue;

    const trackingNo = normalizeTrackingValue(item);
    if (trackingNo) return trackingNo;
  }

  for (const item of Object.values(record)) {
    const trackingNo = extractTrackingNo(item, depth + 1);
    if (trackingNo) return trackingNo;
  }

  return "";
}

function extractRowsFromTongtuFetchRows(payload: unknown) {
  const containers: unknown[] = [];

  if (payload && typeof payload === "object") {
    containers.push(payload);

    const data = (payload as { data?: unknown }).data;
    if (data) containers.push(data);
  }

  for (const container of containers) {
    if (Array.isArray(container)) return container;
    if (!container || typeof container !== "object") continue;

    const record = container as Record<string, unknown>;
    for (const key of ["data", "rows", "list", "records"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
  }

  return [];
}

function isTimestampFieldName(key: string) {
  const normalized = normalizeTongtuFieldKey(key);
  return (
    normalized.includes("createtime") ||
    normalized.includes("createdat") ||
    normalized.includes("updatetime") ||
    normalized.includes("updatedat") ||
    normalized.includes("ordertime") ||
    normalized.includes("orderdate") ||
    key.includes("创建时间") ||
    key.includes("下单时间") ||
    key.includes("更新时间")
  );
}

function getTimestampValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000_000 ? value : 0;
  }

  if (typeof value !== "string" || !value.trim()) return 0;

  const parsed = Date.parse(value.trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractRowTimestamp(record: unknown, depth = 0): number {
  if (!record || typeof record !== "object" || depth > 2) return 0;

  const values = record as Record<string, unknown>;
  for (const [key, value] of Object.entries(values)) {
    if (!isTimestampFieldName(key)) continue;

    const timestamp = getTimestampValue(value);
    if (timestamp) return timestamp;
  }

  for (const value of Object.values(values)) {
    const timestamp = extractRowTimestamp(value, depth + 1);
    if (timestamp) return timestamp;
  }

  return 0;
}

function extractWaybillId(record: unknown) {
  if (!record || typeof record !== "object") return "";

  const values = record as Record<string, unknown>;
  const idKeys = new Set([
    "id",
    "waybillid",
    "waybill_id",
    "billid",
    "bill_id",
    "orderid",
    "order_id",
  ]);

  for (const [key, value] of Object.entries(values)) {
    const normalized = normalizeTongtuFieldKey(key);
    if (
      !idKeys.has(normalized) &&
      !key.includes("运单ID") &&
      !key.includes("运单id")
    ) {
      continue;
    }

    const waybillId = normalizeTrackingValue(value);
    if (waybillId) return waybillId;
  }

  return "";
}

function getNumericIdSortValue(record: unknown) {
  const waybillId = extractWaybillId(record);
  if (!/^\d+$/.test(waybillId)) return 0;

  const numericId = Number(waybillId);
  return Number.isFinite(numericId) ? numericId : 0;
}

function sortRowsByNewest(rows: unknown[]) {
  return [...rows].sort((left, right) => {
    const timeDelta = extractRowTimestamp(right) - extractRowTimestamp(left);
    if (timeDelta !== 0) return timeDelta;

    return getNumericIdSortValue(right) - getNumericIdSortValue(left);
  });
}

function extractMatchingWaybillFromRows(rows: unknown[], shipmentNo: string) {
  const matchedRows = rows.filter((row) =>
    recordMatchesShipmentNo(row, shipmentNo),
  );
  const candidateRows = matchedRows.length > 0 ? matchedRows : rows.length === 1 ? rows : [];
  const normalizedShipmentNo = normalizeComparableText(shipmentNo);

  for (const row of sortRowsByNewest(candidateRows)) {
    const trackingNo = extractTrackingNo(row);
    const waybillId = extractWaybillId(row);

    if (trackingNo && normalizeComparableText(trackingNo) !== normalizedShipmentNo) {
      return {
        row,
        trackingNo,
        waybillId,
      };
    }

    if (waybillId) {
      return {
        row,
        trackingNo: "",
        waybillId,
      };
    }
  }

  return {
    row: undefined,
    trackingNo: "",
    waybillId: "",
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchTongtuWaybillRows(params: {
  baseUrl: string;
  token: string;
  shipmentNo: string;
  websocketToken: string;
  visitorId: string;
  attempt: number;
}) {
  const payload = {
    startRow: 0,
    endRow: 49,
    filterModel: {},
    sortModel: [],
    tableId: TONGTU_DEDICATED_LINE_TABLE_ID,
    businessType: TONGTU_DEDICATED_LINE_BUSINESS_TYPE,
    status: "all",
    nos: [params.shipmentNo],
    type: null,
  };
  const bodyText = JSON.stringify(payload);
  const response = await fetch(
    joinTongtuUrl(params.baseUrl, TONGTU_FETCH_WAYBILL_ROWS_PATH),
    {
      method: "POST",
      headers: buildTongtuHeaders({
        baseUrl: params.baseUrl,
        token: params.token,
        path: TONGTU_FETCH_WAYBILL_ROWS_PATH,
        bodyText,
        websocketToken: params.websocketToken,
        visitorId: params.visitorId,
        contentType: "application/json",
      }),
      body: bodyText,
    },
  );
  const responseText = await response.text().catch(() => "");
  let result: TongtuApiResponse | null = null;

  try {
    result = responseText ? (JSON.parse(responseText) as TongtuApiResponse) : null;
  } catch {
    result = null;
  }

  logTongtuResponse("waybill query response", {
    attempt: params.attempt,
    request: payload,
    status: response.status,
    statusText: response.statusText,
    headers: getResponseHeaders(response),
    payload: result ?? responseText,
  });

  if (!response.ok) {
    throw new Error(getPayloadError(result) || "通途运单列表查询失败");
  }

  assertTongtuSuccess(result, "通途运单列表查询失败");

  return result;
}

async function queryTongtuTrackingNo(params: {
  baseUrl: string;
  token: string;
  shipmentNo: string;
  websocketToken: string;
  visitorId: string;
  attempts?: number;
}) {
  let lastRowCount = 0;
  let lastError = "";
  const attempts = params.attempts ?? TONGTU_WAYBILL_QUERY_ATTEMPTS;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) {
      await sleep(TONGTU_WAYBILL_QUERY_DELAY_MS);
    }

    try {
      const payload = await fetchTongtuWaybillRows({
        ...params,
        attempt,
      });
      const rows = extractRowsFromTongtuFetchRows(payload);
      lastRowCount = rows.length;
      const waybill = extractMatchingWaybillFromRows(rows, params.shipmentNo);

      if (waybill.trackingNo || waybill.waybillId) {
        return {
          attempts: attempt,
          rowCount: rows.length,
          trackingNo: waybill.trackingNo,
          waybillId: waybill.waybillId,
          row: waybill.row,
        };
      }
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "通途运单列表查询失败";
      logTongtuResponse("waybill query error", {
        attempt,
        error: lastError,
      });
    }
  }

  return {
    error: lastError,
    attempts,
    rowCount: lastRowCount,
    trackingNo: "",
    waybillId: "",
  };
}

async function importTongtuWaybill(params: {
  baseUrl: string;
  token: string;
  importKey: string;
  websocketToken: string;
  visitorId: string;
}) {
  const payload: TongtuImportPayload = {
    ossKeys: [params.importKey],
    businessType: TONGTU_DEDICATED_LINE_BUSINESS_TYPE,
    createState: TONGTU_CREATE_STATE_PRE_REPORTED,
    convertOption: 1,
    importType: TONGTU_IMPORT_CREATE_NEW,
    huoWuTeXingType: 0,
    overwriteMode: false,
    shouHuoQuDaoMingCheng: "",
    noConfirm: true,
    websocketSessionId: createId(),
    websocketToken: params.websocketToken,
  };
  const bodyText = JSON.stringify(payload);
  const response = await fetch(
    joinTongtuUrl(params.baseUrl, TONGTU_IMPORT_WAYBILL_PATH),
    {
      method: "POST",
      headers: buildTongtuHeaders({
        baseUrl: params.baseUrl,
        token: params.token,
        path: TONGTU_IMPORT_WAYBILL_PATH,
        bodyText,
        websocketToken: params.websocketToken,
        visitorId: params.visitorId,
        contentType: "application/json",
      }),
      body: bodyText,
    },
  );
  const result = (await response.json().catch(() => null)) as
    | TongtuApiResponse
    | null;

  logTongtuResponse("import waybill response", {
    status: response.status,
    statusText: response.statusText,
    headers: getResponseHeaders(response),
    payload: result,
  });

  if (!response.ok) {
    throw new Error(getPayloadError(result) || "通途导入运单失败");
  }

  assertTongtuSuccess(result, "通途导入运单失败");

  return result;
}

function getTaskId(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";

  const result = payload as { data?: { taskId?: unknown } };
  return getOptionalText(result.data?.taskId);
}

export async function POST(request: Request) {
  try {
    await verifyLogisticsOperator();

    const body = (await request.json()) as TongtuOrderSubmitRequestBody;
    const shipmentId = getRequiredText(body.shipmentId, "缺少货件ID");
    const adminClient = createSupabaseAdminClient();
    const { data: shipmentData, error: shipmentError } = await adminClient
      .from("shipment_records")
      .select(
        "id, logistics_provider, shipment_no, order_invoice_url, tracking_no",
      )
      .eq("status", "有效")
      .eq("id", shipmentId)
      .single();

    if (shipmentError) {
      throw shipmentError;
    }

    const shipment = shipmentData as ShipmentRow;
    if (shipment.logistics_provider?.trim() !== "通途") {
      throw new Error("当前货件物流商不是通途");
    }

    const shipmentNo = getRequiredText(
      shipment.shipment_no,
      "缺少货件号，无法查询通途运单编号",
    );
    const invoiceUrl = getRequiredText(
      shipment.order_invoice_url,
      "请先生成通途下单发票",
    );
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
    const websocketToken = createId();
    const visitorId = createId();
    const token = await loginTongtu({
      baseUrl,
      username,
      password,
    });
    const existingQueryResult = await queryTongtuTrackingNo({
      baseUrl,
      token,
      shipmentNo,
      websocketToken,
      visitorId,
      attempts: 1,
    });

    if (existingQueryResult.trackingNo || existingQueryResult.waybillId) {
      const existingTrackingNo =
        existingQueryResult.trackingNo ||
        getOptionalText(shipment.tracking_no) ||
        existingQueryResult.waybillId;
      const { data: updatedShipment, error: updateError } = await adminClient
        .from("shipment_records")
        .update({
          tracking_no: existingTrackingNo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", shipment.id)
        .select("*")
        .single();

      if (updateError) {
        throw updateError;
      }

      return NextResponse.json({
        data: updatedShipment,
        trackingNo: existingTrackingNo,
        waybillId: existingQueryResult.waybillId,
        taskId: "",
        ossKey: "",
        imported: null,
        queried: existingQueryResult,
        reusedExistingWaybill: true,
      });
    }

    const invoiceResponse = await fetch(invoiceUrl, { cache: "no-store" });

    if (!invoiceResponse.ok) {
      throw new Error("通途下单发票文件读取失败");
    }

    const invoiceBuffer = await invoiceResponse.arrayBuffer();
    const sts = await getTongtuOssSts({
      baseUrl,
      token,
      websocketToken,
      visitorId,
    });
    const uploadResult = await uploadTongtuOssFile({
      sts,
      buffer: invoiceBuffer,
    });
    const importResult = await importTongtuWaybill({
      baseUrl,
      token,
      importKey: uploadResult.importKey,
      websocketToken,
      visitorId,
    });
    const immediateTrackingNo = extractTrackingNo(importResult);
    const queryResult = await queryTongtuTrackingNo({
      baseUrl,
      token,
      shipmentNo,
      websocketToken,
      visitorId,
    });
    const trackingNo = queryResult.trackingNo || immediateTrackingNo;
    const waybillId = queryResult.waybillId;
    const taskId = getTaskId(importResult);
    const updatePayload = trackingNo
      ? {
          tracking_no: trackingNo,
          updated_at: new Date().toISOString(),
        }
      : {
          updated_at: new Date().toISOString(),
        };
    const { data: updatedShipment, error: updateError } = await adminClient
      .from("shipment_records")
      .update(updatePayload)
      .eq("id", shipment.id)
      .select("*")
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      data: updatedShipment,
      trackingNo,
      waybillId,
      taskId,
      ossKey: uploadResult.importKey,
      imported: importResult,
      queried: queryResult,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "通途导入运单失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
