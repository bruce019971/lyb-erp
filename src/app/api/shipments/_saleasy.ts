import { constants, createPublicKey, publicEncrypt } from "node:crypto";

export type SaleasyApiResponse<T = unknown> = {
  code?: unknown;
  success?: unknown;
  result?: T;
  data?: unknown;
  message?: unknown;
  msg?: unknown;
  error?: unknown;
  errMsg?: unknown;
  errMsgs?: unknown;
};

export const DEFAULT_SALEASY_BASE_URL = "https://api.saleasy.com";
export const SALEASY_GET_PUBLIC_KEY_PATH = "/api/Login/GetPublicKey";
export const SALEASY_LOGIN_PATH = "/api/Login/RequestToken";
export const SALEASY_PLATFORM_ADDRESS_PATH =
  "/api/BasicDataService/PlatformAddress/GetList";
export const SALEASY_PRODUCT_SEARCH_PATH =
  "/api/ProductService/Product/GetAutoListPaged";
export const SALEASY_COMMON_ADDRESS_PATH =
  "/api/ProductService/CommonContacter/GetList";
export const SALEASY_CREATE_TRANSPORT_PLAN_PATH =
  "/api/WarehouseService/TransportPlan/Create";
export const SALEASY_TRANSPORT_PLAN_DETAIL_PATH =
  "/api/WarehouseService/TransportPlan/GetDetail";
export const SALEASY_TRANSPORT_PLAN_LOGISTICS_PATH =
  "/api/WarehouseService/WarehouseLogistics/TransportPlanGetLogistic";
export const SALEASY_TRANSPORT_PLAN_FEE_DETAIL_PATH =
  "/api/WarehouseService/TransportPlan/GetTransportPlanLogisticesFeeDetail";
export const SALEASY_SET_TRANSPORT_INFO_PATH =
  "/api/WarehouseService/TransportPlan/SetTransportInfo";
export const SALEASY_CONFIRM_TRANSPORT_PLAN_PATH =
  "/api/WarehouseService/TransportPlan/Confirm";
export const SALEASY_CONFIRM_PAY_ON_ARRIVAL_PATH =
  "/api/WarehouseService/TransportPlan/ConfirmPayOnArrival";
export const SALEASY_TRANSPORT_PLAN_LIST_PATH =
  "/api/WarehouseService/TransportPlan/GetPlanPaged";
export const SALEASY_TRANSPORT_PLAN_QUERY_TRACKS_PATH =
  "/api/WarehouseService/TransportPlan/QueryTracks";
export const SALEASY_PRINT_TRANSPORT_PLAN_BOX_PATH =
  "/api/WarehouseService/TransportPlan/BatchPrint/TransportPlanBatchPrintBox.pdf";
export const SALEASY_WAYBILL_LIST_PATH =
  "/api/WarehouseService/WaybillPlan/GetPagedList";
export const SALEASY_PRINT_WAYBILL_PLAN_PATH =
  "/api/WarehouseService/WaybillPlan/PrintWaybillPlan";
export const SALEASY_COST_LOG_LIST_PATH =
  "/api/ProductService/CostLog/GetListPaged";

export function getRequiredText(value: unknown, message: string) {
  const text = getOptionalText(value);

  if (!text) {
    throw new Error(message);
  }

  return text;
}

export function getOptionalText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function getOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

export function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function getPayloadError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";

  const result = payload as SaleasyApiResponse;
  for (const value of [
    result.message,
    result.msg,
    result.error,
    result.errMsg,
    result.data,
  ]) {
    const text = getOptionalText(value);
    if (text) return text;
  }

  if (result.errMsgs && typeof result.errMsgs === "object") {
    const values = Object.values(result.errMsgs as Record<string, unknown>)
      .flatMap((item) => (Array.isArray(item) ? item : [item]))
      .map(getOptionalText)
      .filter(Boolean);

    if (values.length) return values.join("；");
  }

  return "";
}

function maskSensitiveText(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return "";
  if (trimmed.length <= 8) return "***";

  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function redactSaleasyLogValue(value: unknown, key = ""): unknown {
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
    return value.map((item) => redactSaleasyLogValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([itemKey, itemValue]) => [
        itemKey,
        redactSaleasyLogValue(itemValue, itemKey),
      ]),
    );
  }

  return value;
}

export function getResponseHeaders(response: Response) {
  return Object.fromEntries(response.headers.entries());
}

export function logSaleasyResponse(
  scope: string,
  label: string,
  values: Record<string, unknown>,
) {
  console.log(`[${scope}] ${label}`, redactSaleasyLogValue(values));
}

export function normalizeSaleasyBaseUrl(systemUrl?: string | null) {
  const rawUrl = systemUrl?.trim() || DEFAULT_SALEASY_BASE_URL;
  const withProtocol = /^https?:\/\//i.test(rawUrl)
    ? rawUrl
    : `https://${rawUrl}`;

  try {
    const url = new URL(withProtocol);
    if (
      url.hostname === "saleasy.com" ||
      url.hostname === "www.saleasy.com" ||
      (url.hostname.endsWith(".saleasy.com") &&
        url.hostname !== "api.saleasy.com")
    ) {
      url.hostname = "api.saleasy.com";
    }

    return url.origin;
  } catch {
    return DEFAULT_SALEASY_BASE_URL;
  }
}

export function joinSaleasyUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | null | undefined>,
) {
  const url = new URL(path, `${baseUrl}/`);

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      url.searchParams.set(key, String(value));
    });
  }

  return url.toString();
}

function getSaleasyCode(payload: SaleasyApiResponse | null) {
  if (!payload || payload.code === undefined || payload.code === null) {
    return undefined;
  }

  if (typeof payload.code === "number") return payload.code;
  if (typeof payload.code === "string" && payload.code.trim()) {
    const parsed = Number(payload.code.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

export function assertSaleasySuccess(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    throw new Error(fallback);
  }

  const result = payload as SaleasyApiResponse;
  const code = getSaleasyCode(result);

  if (
    result.success === false ||
    (code !== undefined && code !== 0)
  ) {
    throw new Error(getPayloadError(payload) || fallback);
  }
}

function buildSaleasyHeaders(params: {
  token?: string;
  hasJsonBody?: boolean;
}) {
  const headers: Record<string, string> = {
    "custom-culture": "zh-CN",
  };

  if (params.hasJsonBody) {
    headers["content-type"] = "application/json; charset=utf-8";
  }

  if (params.token) {
    headers.Authorization = `Bearer ${params.token}`;
  }

  return headers;
}

export async function requestSaleasyJson<T = unknown>(params: {
  baseUrl: string;
  path: string;
  token?: string;
  method?: "GET" | "POST";
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  logScope: string;
  label: string;
  fallbackError: string;
}) {
  const method = params.method ?? "POST";
  const hasJsonBody = method !== "GET";
  const bodyText = hasJsonBody ? JSON.stringify(params.body ?? {}) : undefined;
  const response = await fetch(
    joinSaleasyUrl(params.baseUrl, params.path, params.query),
    {
      method,
      headers: buildSaleasyHeaders({
        token: params.token,
        hasJsonBody,
      }),
      body: bodyText,
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | SaleasyApiResponse<T>
    | null;

  logSaleasyResponse(params.logScope, params.label, {
    request: {
      path: params.path,
      method,
      body: params.body,
      query: params.query,
    },
    status: response.status,
    statusText: response.statusText,
    headers: getResponseHeaders(response),
    payload,
  });

  if (!response.ok) {
    throw new Error(getPayloadError(payload) || params.fallbackError);
  }

  assertSaleasySuccess(payload, params.fallbackError);

  if (!payload || typeof payload !== "object") {
    return payload as T;
  }

  if ("result" in payload) return payload.result as T;
  if ("data" in payload) return payload.data as T;

  return payload as T;
}

function formatPublicKey(publicKey: string) {
  const trimmed = publicKey.trim();
  if (/BEGIN PUBLIC KEY/.test(trimmed)) return trimmed;

  const normalized = trimmed.replace(/\s+/g, "");
  const lines = normalized.match(/.{1,64}/g)?.join("\n") ?? normalized;

  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

function getPublicKeyByteLength(publicKey: string) {
  const keyObject = createPublicKey(formatPublicKey(publicKey));
  const modulusLength = keyObject.asymmetricKeyDetails?.modulusLength;

  if (!modulusLength) {
    throw new Error("赛易公钥格式异常，无法识别密钥长度");
  }

  return Math.ceil(modulusLength / 8);
}

function decodeStrictBase64(value: string) {
  const normalized = value.trim();

  if (!normalized || normalized.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return null;

  const decoded = Buffer.from(normalized, "base64");
  const encoded = decoded.toString("base64").replace(/=+$/, "");
  const comparable = normalized.replace(/=+$/, "");

  return encoded === comparable ? decoded : null;
}

function encryptSaleasyPassword(password: string, publicKey: string) {
  const passwordText = password.trim();
  const keyByteLength = getPublicKeyByteLength(publicKey);
  const decodedPassword = decodeStrictBase64(passwordText);

  if (decodedPassword?.length === keyByteLength) {
    return passwordText;
  }

  const passwordBuffer = Buffer.from(passwordText, "utf8");
  const maxPasswordBytes = keyByteLength - 11;

  if (passwordBuffer.length > maxPasswordBytes) {
    throw new Error(
      `赛易物流商密码过长，当前为 ${passwordBuffer.length} 字节，RSA 公钥最多支持 ${maxPasswordBytes} 字节；请在物流管理中填写赛易原始密码，不要填写已加密密文`,
    );
  }

  return publicEncrypt(
    {
      key: formatPublicKey(publicKey),
      padding: constants.RSA_PKCS1_PADDING,
    },
    passwordBuffer,
  ).toString("base64");
}

function extractSaleasyAccessToken(value: unknown) {
  const record = toRecord(value);
  if (!record) return "";

  for (const key of ["accessToken", "token", "access_token"]) {
    const token = getOptionalText(record[key]);
    if (token) return token;
  }

  return "";
}

export async function loginSaleasy(params: {
  baseUrl: string;
  username: string;
  password: string;
  logScope: string;
}) {
  const publicKey = await requestSaleasyJson<string>({
    baseUrl: params.baseUrl,
    path: SALEASY_GET_PUBLIC_KEY_PATH,
    method: "GET",
    logScope: params.logScope,
    label: "public key response",
    fallbackError: "赛易公钥获取失败",
  });
  const encryptedPassword = encryptSaleasyPassword(params.password, publicKey);
  const loginResult = await requestSaleasyJson<unknown>({
    baseUrl: params.baseUrl,
    path: SALEASY_LOGIN_PATH,
    body: {
      username: params.username,
      password: encryptedPassword,
      isRsaPassword: true,
    },
    logScope: params.logScope,
    label: "login response",
    fallbackError: "赛易登录失败",
  });
  const token = extractSaleasyAccessToken(loginResult);

  if (!token) {
    throw new Error("赛易登录接口未返回Token");
  }

  return token;
}

export function extractRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;

  const record = toRecord(value);
  if (!record) return [];

  for (const key of ["items", "records", "rows", "list", "data", "result"]) {
    const child = record[key];
    if (Array.isArray(child)) return child;

    const nestedRows = extractRows(child);
    if (nestedRows.length > 0) return nestedRows;
  }

  return [];
}

export function normalizeComparableText(value: unknown) {
  return getOptionalText(value).replace(/\s+/g, "").toLowerCase();
}

export function getFirstFieldText(
  record: Record<string, unknown>,
  fieldNames: string[],
) {
  for (const fieldName of fieldNames) {
    const value = getOptionalText(record[fieldName]);
    if (value) return value;
  }

  return "";
}

export function getFirstFieldNumber(
  record: Record<string, unknown>,
  fieldNames: string[],
) {
  for (const fieldName of fieldNames) {
    const value = getOptionalNumber(record[fieldName]);
    if (value !== undefined) return value;
  }

  return undefined;
}

export function recordContainsText(
  record: unknown,
  expected: string,
  depth = 0,
): boolean {
  if (!expected || !record || depth > 4) return false;

  const normalizedExpected = normalizeComparableText(expected);
  if (!normalizedExpected) return false;

  if (Array.isArray(record)) {
    return record.some((item) =>
      recordContainsText(item, expected, depth + 1),
    );
  }

  if (typeof record !== "object") {
    const value = normalizeComparableText(record);
    return value === normalizedExpected || value.includes(normalizedExpected);
  }

  return Object.values(record as Record<string, unknown>).some((value) =>
    recordContainsText(value, expected, depth + 1),
  );
}

export function extractId(value: unknown) {
  const direct = getOptionalText(value);
  if (direct) return direct;

  const record = toRecord(value);
  if (!record) return "";

  return getFirstFieldText(record, [
    "id",
    "planId",
    "transportPlanId",
    "waybillId",
    "waybillPlanId",
  ]);
}

export function extractFileUrl(value: unknown, depth = 0): string {
  if (!value || depth > 5) return "";

  if (typeof value === "string") {
    return /^https?:\/\//i.test(value) || value.startsWith("/")
      ? value.trim()
      : "";
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const fileUrl = extractFileUrl(item, depth + 1);
      if (fileUrl) return fileUrl;
    }

    return "";
  }

  const record = toRecord(value);
  if (!record) return "";

  const directUrl = getFirstFieldText(record, [
    "url",
    "fileUrl",
    "fileurl",
    "downloadUrl",
    "pdfUrl",
    "path",
  ]);

  if (directUrl) return directUrl;

  for (const item of Object.values(record)) {
    const fileUrl = extractFileUrl(item, depth + 1);
    if (fileUrl) return fileUrl;
  }

  return "";
}

export function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
