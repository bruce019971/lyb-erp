import { createHash, randomUUID } from "node:crypto";

export type TongtuApiResponse<T = unknown> = {
  statusCode?: unknown;
  success?: unknown;
  data?: T;
  message?: unknown;
  msg?: unknown;
  error?: unknown;
};

export type TongtuWaybillQueryResult = {
  attempts: number;
  rowCount: number;
  trackingNo: string;
  waybillId: string;
  row?: unknown;
  matchedCount?: number;
  matchedShipmentNo?: boolean;
  error?: string;
};

export type TongtuVolumeBox = {
  packno: string;
  width: number | null;
  length: number | null;
  height: number | null;
  yjf_weit: number | null;
};

const DEFAULT_TONGTU_BASE_URL = "https://szttgj.itdida.com";
const TONGTU_LOGIN_PATH = "/itdida-api/login";
const TONGTU_FETCH_WAYBILL_ROWS_PATH = "/itdida-api/flash/waybill/fetchRows";
const TONGTU_DEDICATED_LINE_BUSINESS_TYPE = 2;
const TONGTU_DEDICATED_LINE_TABLE_ID = "caoZuoYunDanTable_ke_hu_zx";
const TONGTU_WAYBILL_QUERY_ATTEMPTS = 6;
const TONGTU_WAYBILL_QUERY_DELAY_MS = 2000;

export function getRequiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

export function getOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function getPayloadError(payload: unknown) {
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

export function getResponseHeaders(response: Response) {
  return Object.fromEntries(response.headers.entries());
}

export function logTongtuResponse(
  scope: string,
  label: string,
  values: Record<string, unknown>,
) {
  console.log(`[${scope}] ${label}`, redactTongtuLogValue(values));
}

export function assertTongtuSuccess(payload: unknown, fallback: string) {
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

  if (
    result.success === false ||
    (statusCode !== undefined && statusCode !== 200)
  ) {
    throw new Error(getPayloadError(payload) || fallback);
  }
}

export function normalizeBaseUrl(systemUrl?: string | null) {
  const fallback = DEFAULT_TONGTU_BASE_URL;
  const rawUrl = systemUrl?.trim() || fallback;
  const withProtocol = /^https?:\/\//i.test(rawUrl)
    ? rawUrl
    : `https://${rawUrl}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return fallback;
  }
}

export function joinTongtuUrl(baseUrl: string, path: string) {
  return new URL(path, `${baseUrl}/`).toString();
}

export function createTongtuId() {
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
  const visitorDigest = md5(
    `/${getSubdomain(params.baseUrl)}|${params.visitorId}`,
  );
  const checksumSource =
    bodyDigest.substring(2) +
    visitorDigest.substring(0) +
    bodyDigest.substring(2) +
    visitorDigest.substring(3) +
    params.path +
    (params.query || "");

  return md5(checksumSource);
}

export function buildTongtuHeaders(params: {
  baseUrl: string;
  token: string;
  path: string;
  bodyText?: string;
  query?: string;
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
      query: params.query,
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

export async function loginTongtu(params: {
  baseUrl: string;
  username: string;
  password: string;
  logScope: string;
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
  logTongtuResponse(params.logScope, "login response", {
    status: response.status,
    statusText: response.statusText,
    headers: getResponseHeaders(response),
    payload: payload
      ? {
          ...payload,
          data:
            typeof payload.data === "string"
              ? maskSensitiveText(payload.data)
              : payload.data,
        }
      : payload,
  });

  if (!response.ok) {
    throw new Error(getPayloadError(payload) || "通途登录失败");
  }

  assertTongtuSuccess(payload, "通途登录失败");

  return getRequiredText(payload?.data, "通途登录接口未返回Token");
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

function parseTongtuNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value !== "string" || !value.trim()) return null;

  const trimmed = value.trim().replace(/,/g, "");
  const directValue = Number(trimmed);

  if (Number.isFinite(directValue)) return directValue;

  const matchedValue = trimmed.match(/-?\d+(?:\.\d+)?/);
  if (!matchedValue) return null;

  const numericValue = Number(matchedValue[0]);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function roundTongtuNumber(value: number, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getTongtuNumberField(
  record: Record<string, unknown>,
  matcher: (key: string) => boolean,
) {
  for (const [key, value] of Object.entries(record)) {
    if (!matcher(key)) continue;

    const numericValue = parseTongtuNumber(value);
    if (numericValue !== null) return numericValue;
  }

  return null;
}

function getTongtuTextField(
  record: Record<string, unknown>,
  matcher: (key: string) => boolean,
) {
  for (const [key, value] of Object.entries(record)) {
    if (!matcher(key)) continue;

    const text = normalizeTrackingValue(value);
    if (text) return text;
  }

  return "";
}

function parseTongtuDimensionsText(value: unknown) {
  const text = normalizeTrackingValue(value);
  if (!text) return null;

  const matchedValues = text.match(/\d+(?:\.\d+)?/g);
  if (!matchedValues || matchedValues.length < 3) return null;

  const [length, width, height] = matchedValues
    .slice(0, 3)
    .map((item) => Number(item));

  if (
    !Number.isFinite(length) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }

  return {
    length,
    width,
    height,
  };
}

function isReceivedChargeWeightFieldName(key: string) {
  const normalized = normalizeTongtuFieldKey(key);
  return (
    [
      "shouhuojifeizhong",
      "shouhuojifeizhongliang",
      "receivedchargeweight",
      "receivechargeweight",
      "receivingchargeweight",
      "receiptchargeweight",
      "receivedbillingweight",
      "receivebillingweight",
      "receivingbillingweight",
      "receiptbillingweight",
    ].includes(normalized) ||
    key.includes("收货计费重")
  );
}

function isTongtuBoxNoFieldName(key: string) {
  const normalized = normalizeTongtuFieldKey(key);
  return (
    [
      "packno",
      "packnumber",
      "boxno",
      "boxnumber",
      "cartonno",
      "cartonnumber",
      "xianghao",
      "xiangzihao",
    ].includes(normalized) ||
    key.includes("箱号") ||
    key.includes("箱唛号") ||
    key.includes("包裹号")
  );
}

function isTongtuLengthFieldName(key: string) {
  if (isTongtuDimensionTextFieldName(key)) return false;

  const normalized = normalizeTongtuFieldKey(key);
  return (
    [
      "length",
      "boxlength",
      "cartonlength",
      "goodslength",
      "chang",
      "changdu",
    ].includes(normalized) ||
    key.includes("长")
  );
}

function isTongtuWidthFieldName(key: string) {
  if (isTongtuDimensionTextFieldName(key)) return false;

  const normalized = normalizeTongtuFieldKey(key);
  return (
    [
      "width",
      "boxwidth",
      "cartonwidth",
      "goodswidth",
      "kuan",
      "kuandu",
    ].includes(normalized) ||
    key.includes("宽")
  );
}

function isTongtuHeightFieldName(key: string) {
  if (isTongtuDimensionTextFieldName(key)) return false;

  const normalized = normalizeTongtuFieldKey(key);
  return (
    [
      "height",
      "boxheight",
      "cartonheight",
      "goodsheight",
      "gao",
      "gaodu",
    ].includes(normalized) ||
    key.includes("高")
  );
}

function isTongtuDimensionTextFieldName(key: string) {
  const normalized = normalizeTongtuFieldKey(key);
  return (
    [
      "size",
      "boxsize",
      "cartonsize",
      "dimension",
      "dimensions",
      "boxdimension",
      "boxdimensions",
      "measure",
      "guige",
    ].includes(normalized) ||
    key.includes("尺寸") ||
    key.includes("规格") ||
    key.includes("长宽高")
  );
}

function isTongtuSingleBoxVolumeFieldName(key: string) {
  const normalized = normalizeTongtuFieldKey(key);
  return (
    [
      "yjfweit",
      "singlevolume",
      "boxvolume",
      "cartonvolume",
      "volume",
      "cbm",
      "fangshu",
      "tiji",
      "jitiji",
      "jifeizhong",
    ].includes(normalized) ||
    isReceivedChargeWeightFieldName(key) ||
    key.includes("单箱方数") ||
    key.includes("方数") ||
    key.includes("体积")
  );
}

function getTongtuDimensionText(record: Record<string, unknown>) {
  for (const [key, value] of Object.entries(record)) {
    if (!isTongtuDimensionTextFieldName(key)) continue;

    const dimensions = parseTongtuDimensionsText(value);
    if (dimensions) return dimensions;
  }

  return null;
}

function normalizeTongtuVolumeBox(
  record: Record<string, unknown>,
): TongtuVolumeBox | null {
  const dimensions = getTongtuDimensionText(record);
  const length =
    getTongtuNumberField(record, isTongtuLengthFieldName) ??
    dimensions?.length ??
    null;
  const width =
    getTongtuNumberField(record, isTongtuWidthFieldName) ??
    dimensions?.width ??
    null;
  const height =
    getTongtuNumberField(record, isTongtuHeightFieldName) ??
    dimensions?.height ??
    null;
  const calculatedVolume =
    length !== null && width !== null && height !== null
      ? roundTongtuNumber((length * width * height) / 1_000_000)
      : null;
  const singleBoxVolume =
    getTongtuNumberField(record, isTongtuSingleBoxVolumeFieldName) ??
    calculatedVolume;
  const packno = getTongtuTextField(record, isTongtuBoxNoFieldName);

  if (
    length === null &&
    width === null &&
    height === null &&
    singleBoxVolume === null
  ) {
    return null;
  }

  return {
    packno,
    width,
    length,
    height,
    yjf_weit:
      singleBoxVolume === null ? null : roundTongtuNumber(singleBoxVolume),
  };
}

function dedupeTongtuVolumeBoxes(boxes: TongtuVolumeBox[]) {
  const seen = new Set<string>();
  const result: TongtuVolumeBox[] = [];

  boxes.forEach((box) => {
    const key = [
      box.packno,
      box.length,
      box.width,
      box.height,
      box.yjf_weit,
    ].join("|");

    if (seen.has(key)) return;

    seen.add(key);
    result.push(box);
  });

  return result;
}

export function extractTongtuVolumeBoxes(
  value: unknown,
  depth = 0,
): TongtuVolumeBox[] {
  if (!value || depth > 6) return [];

  if (Array.isArray(value)) {
    return dedupeTongtuVolumeBoxes(
      value.flatMap((item) => extractTongtuVolumeBoxes(item, depth + 1)),
    );
  }

  if (typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const nestedBoxes = Object.values(record).flatMap((item) =>
    extractTongtuVolumeBoxes(item, depth + 1),
  );

  if (nestedBoxes.length > 0) {
    return dedupeTongtuVolumeBoxes(nestedBoxes);
  }

  const box = normalizeTongtuVolumeBox(record);
  return box ? [box] : [];
}

export function extractTongtuReceivedChargeWeight(
  value: unknown,
  depth = 0,
): number | null {
  if (!value || depth > 6) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const numericValue = extractTongtuReceivedChargeWeight(item, depth + 1);
      if (numericValue !== null) return numericValue;
    }

    return null;
  }

  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;

  for (const [key, item] of Object.entries(record)) {
    if (!isReceivedChargeWeightFieldName(key)) continue;

    const numericValue = parseTongtuNumber(item);
    if (numericValue !== null) return numericValue;
  }

  for (const item of Object.values(record)) {
    const numericValue = extractTongtuReceivedChargeWeight(item, depth + 1);
    if (numericValue !== null) return numericValue;
  }

  return null;
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

const TONGTU_TRACKING_FIELD_PRIORITY = [
  "carrierbillno",
  "zhuandanhao",
  "transferno",
  "seventeenno",
  "carriertrackingno",
  "carrierwaybillno",
  "trackingnumber",
  "trackingno",
  "waybillno",
  "waybillnumber",
  "ordertrackingno",
  "packno",
  "packnumber",
  "yundanhao",
  "billno",
  "xitongdanhao",
  "systembillno",
  "systemno",
  "systemorderno",
  "masterbillnoair",
  "masterbillnosea",
] as const;

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

export function extractTongtuTrackingNo(value: unknown, depth = 0): string {
  if (!value || depth > 6) return "";

  if (Array.isArray(value)) {
    for (const item of value) {
      const trackingNo = extractTongtuTrackingNo(item, depth + 1);
      if (trackingNo) return trackingNo;
    }
    return "";
  }

  if (typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  const entries = Object.entries(record);

  for (const fieldName of TONGTU_TRACKING_FIELD_PRIORITY) {
    const matchedEntry = entries.find(
      ([key]) => normalizeTongtuFieldKey(key) === fieldName,
    );
    const trackingNo = normalizeTrackingValue(matchedEntry?.[1]);
    if (trackingNo) return trackingNo;
  }

  for (const [key, item] of entries) {
    if (!isTrackingFieldName(key)) continue;

    const trackingNo = normalizeTrackingValue(item);
    if (trackingNo) return trackingNo;
  }

  for (const item of Object.values(record)) {
    const trackingNo = extractTongtuTrackingNo(item, depth + 1);
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

function getDirectWaybillId(record: unknown) {
  if (!record || typeof record !== "object") return "";

  const values = record as Record<string, unknown>;
  const exactKeys = new Set([
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
      !exactKeys.has(normalized) &&
      !key.includes("运单ID") &&
      !key.includes("运单id")
    ) {
      continue;
    }

    const id = normalizeTrackingValue(value);
    if (id) return id;
  }

  return "";
}

function getNumericIdSortValue(record: unknown) {
  const id = getDirectWaybillId(record);
  if (!/^\d+$/.test(id)) return 0;

  const numericId = Number(id);
  return Number.isFinite(numericId) ? numericId : 0;
}

function sortRowsByNewest(rows: unknown[]) {
  return [...rows].sort((left, right) => {
    const timeDelta = extractRowTimestamp(right) - extractRowTimestamp(left);
    if (timeDelta !== 0) return timeDelta;

    return getNumericIdSortValue(right) - getNumericIdSortValue(left);
  });
}

function rowMatchesIdentifiers(
  row: unknown,
  shipmentNo: string,
  trackingNo?: string,
) {
  if (recordMatchesShipmentNo(row, shipmentNo)) return true;

  const expectedTrackingNo = normalizeComparableText(trackingNo);
  if (!expectedTrackingNo) return false;

  return normalizeComparableText(extractTongtuTrackingNo(row)) === expectedTrackingNo;
}

function extractMatchingTongtuWaybill(params: {
  rows: unknown[];
  shipmentNo: string;
  trackingNo?: string;
}) {
  const shipmentNoMatchedRows = params.rows.filter((row) =>
    recordMatchesShipmentNo(row, params.shipmentNo),
  );
  const matchedRows = params.rows.filter((row) =>
    rowMatchesIdentifiers(row, params.shipmentNo, params.trackingNo),
  );
  const candidateRows =
    matchedRows.length > 0
      ? matchedRows
      : params.rows.length === 1
        ? params.rows
        : [];
  const normalizedShipmentNo = normalizeComparableText(params.shipmentNo);
  const sortedRows = sortRowsByNewest(candidateRows);

  for (const row of sortedRows) {
    const trackingNo = extractTongtuTrackingNo(row);
    const effectiveTrackingNo =
      trackingNo && normalizeComparableText(trackingNo) !== normalizedShipmentNo
        ? trackingNo
        : getOptionalText(params.trackingNo);
    const waybillId = getDirectWaybillId(row);

    if (effectiveTrackingNo || waybillId) {
      return {
        row,
        trackingNo: effectiveTrackingNo,
        waybillId,
        matchedCount: shipmentNoMatchedRows.length || matchedRows.length,
        matchedShipmentNo: recordMatchesShipmentNo(row, params.shipmentNo),
      };
    }
  }

  return {
    row: sortedRows[0],
    trackingNo: "",
    waybillId: "",
    matchedCount: shipmentNoMatchedRows.length || matchedRows.length,
    matchedShipmentNo: sortedRows[0]
      ? recordMatchesShipmentNo(sortedRows[0], params.shipmentNo)
      : false,
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
  nos: string[];
  websocketToken: string;
  visitorId: string;
  attempt: number;
  logScope: string;
}) {
  const payload = {
    startRow: 0,
    endRow: 49,
    filterModel: {},
    sortModel: [],
    tableId: TONGTU_DEDICATED_LINE_TABLE_ID,
    businessType: TONGTU_DEDICATED_LINE_BUSINESS_TYPE,
    status: "all",
    nos: params.nos,
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

  logTongtuResponse(params.logScope, "waybill query response", {
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

export async function queryTongtuWaybill(params: {
  baseUrl: string;
  token: string;
  shipmentNo: string;
  trackingNo?: string;
  websocketToken: string;
  visitorId: string;
  logScope: string;
  returnMatchedRowWithoutWaybill?: boolean;
}): Promise<TongtuWaybillQueryResult> {
  let lastRowCount = 0;
  let lastError = "";
  const nos = Array.from(
    new Set(
      [params.shipmentNo, params.trackingNo]
        .map((item) => item?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  );

  for (let attempt = 1; attempt <= TONGTU_WAYBILL_QUERY_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      await sleep(TONGTU_WAYBILL_QUERY_DELAY_MS);
    }

    try {
      const payload = await fetchTongtuWaybillRows({
        ...params,
        nos,
        attempt,
      });
      const rows = extractRowsFromTongtuFetchRows(payload);
      lastRowCount = rows.length;
      const waybill = extractMatchingTongtuWaybill({
        rows,
        shipmentNo: params.shipmentNo,
        trackingNo: params.trackingNo,
      });

      if (
        waybill.trackingNo ||
        waybill.waybillId ||
        (params.returnMatchedRowWithoutWaybill && waybill.row)
      ) {
        return {
          attempts: attempt,
          rowCount: rows.length,
          trackingNo: waybill.trackingNo,
          waybillId: waybill.waybillId,
          row: waybill.row,
          matchedCount: waybill.matchedCount,
          matchedShipmentNo: waybill.matchedShipmentNo,
        };
      }
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "通途运单列表查询失败";
      logTongtuResponse(params.logScope, "waybill query error", {
        attempt,
        error: lastError,
      });
    }
  }

  return {
    error: lastError,
    attempts: TONGTU_WAYBILL_QUERY_ATTEMPTS,
    rowCount: lastRowCount,
    trackingNo: "",
    waybillId: "",
    matchedCount: 0,
    matchedShipmentNo: false,
  };
}
