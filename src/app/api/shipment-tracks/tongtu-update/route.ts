import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  createTongtuId,
  fetchTongtuWaybillDetail,
  getOptionalText,
  getRequiredText,
  logTongtuResponse,
  loginTongtu,
  normalizeBaseUrl,
  queryTongtuWaybill,
  type TongtuWaybillQueryResult,
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

type TongtuTrackUpdateRequestBody = {
  trackId?: string;
};

type ShipmentTrackRow = {
  id: string;
  shipment_record_id: string;
  shipment:
    | {
        id: string;
        shipment_no: string | null;
        tracking_no: string | null;
        logistics_provider: string | null;
        status: string | null;
      }
    | Array<{
        id: string;
        shipment_no: string | null;
        tracking_no: string | null;
        logistics_provider: string | null;
        status: string | null;
      }>
    | null;
};

type LogisticsProviderRow = {
  system_url: string | null;
  username: string | null;
  password: string | null;
};

type TongtuTrackEvent = {
  index: number;
  content: string;
  time: string;
  businessDate: string | null;
  row: Record<string, unknown>;
};

const LOG_SCOPE = "tongtu-track-update";
const TONGTU_FALLBACK_USERNAME = "7660227";
const TONGTU_FALLBACK_PASSWORD = "Tt7660227";

async function verifyShipmentTrackOperator() {
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

  if (!permissions.includes("shipment_tracks")) {
    throw new Error("当前账号没有货件轨迹权限");
  }
}

function normalizeFieldKey(key: string) {
  return key.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "").toLowerCase();
}

const TONGTU_TRACK_TIME_FIELDS = [
  "sj",
  "time",
  "tracktime",
  "eventtime",
  "operatetime",
  "operationtime",
  "operationdate",
  "trackdate",
  "trackdatetime",
  "happentime",
  "processtime",
  "nodetime",
  "createtime",
  "createdtime",
  "updatetime",
  "updatedtime",
  "gmtcreate",
  "gmtmodified",
  "datestr",
  "date",
  "riqi",
  "shijian",
  "日期",
  "时间",
  "轨迹时间",
  "操作时间",
  "发生时间",
];

const TONGTU_TRACK_DESCRIPTION_FIELDS = [
  "miaoshu",
  "description",
  "desc",
  "detail",
  "detaildesc",
  "remark",
  "memo",
  "message",
  "msg",
  "track",
  "trace",
  "trajectory",
  "trackremark",
  "trackcontent",
  "trackcnremark",
  "trackenremark",
  "content",
  "context",
  "event",
  "eventname",
  "eventdesc",
  "status",
  "statusdesc",
  "statusname",
  "nodename",
  "nodecontent",
  "trackname",
  "guiji",
  "beizhu",
  "note",
  "comment",
  "轨迹",
  "描述",
  "内容",
  "状态",
  "备注",
];

const TONGTU_TRACK_LOCATION_FIELDS = [
  "location",
  "locationname",
  "address",
  "addressname",
  "area",
  "areaname",
  "position",
  "positionname",
  "place",
  "site",
  "city",
  "cityname",
  "country",
  "countryname",
  "provincename",
  "warehouse",
  "仓库",
  "地点",
  "位置",
  "地区",
  "地址",
];

const TONGTU_TRACK_CHILD_WAYBILL_FIELDS = [
  "childtrackingno",
  "childwaybillno",
  "childbillno",
  "childorderno",
  "subtrackingno",
  "subwaybillno",
  "subbillno",
  "suborderno",
  "transferno",
  "zizhuandanhao",
  "转单号",
  "子转单号",
  "子单号",
];

function hasAnyField(row: Record<string, unknown>, fieldNames: readonly string[]) {
  const normalizedFieldNames = fieldNames.map(normalizeFieldKey);

  return Object.keys(row).some((key) =>
    normalizedFieldNames.includes(normalizeFieldKey(key)),
  );
}

function getTextField(row: Record<string, unknown>, fieldNames: readonly string[]) {
  const normalizedFieldNames = fieldNames.map(normalizeFieldKey);

  for (const [key, value] of Object.entries(row)) {
    if (!normalizedFieldNames.includes(normalizeFieldKey(key))) continue;

    const text = getOptionalText(value);
    if (text) return text;
  }

  return "";
}

function normalizeDateTimeText(value: unknown) {
  const text = getOptionalText(value);
  if (!text) return "";

  const matched = text.match(
    /\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[ T]\d{1,2}:\d{1,2}(?::\d{1,2})?)?/,
  );
  if (!matched) {
    const monthDayMatch = text.match(
      /(^|[^\d])(\d{1,2})[-/月](\d{1,2})(?:日)?(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?(?!\d)/,
    );

    if (monthDayMatch) {
      const now = new Date();
      const month = Number(monthDayMatch[2]);
      const day = Number(monthDayMatch[3]);
      const hour = Number(monthDayMatch[4] ?? "0");
      const minute = Number(monthDayMatch[5] ?? "0");
      const second = Number(monthDayMatch[6] ?? "0");
      const candidate = new Date(
        Date.UTC(now.getUTCFullYear(), month - 1, day, hour, minute, second),
      );

      if (!Number.isNaN(candidate.getTime())) {
        return candidate.toISOString();
      }
    }
  }

  const dateText = matched?.[0] ?? text;
  const normalized = dateText.replace(/\//g, "-").replace(" ", "T");
  const timestamp = Date.parse(normalized);

  if (Number.isNaN(timestamp)) return "";

  return new Date(timestamp).toISOString();
}

function isStructuredNoiseText(value: string) {
  const text = value.trim();
  if (!text) return false;

  if (
    (/^[\[{]/.test(text) || text.includes('{"') || text.includes('","')) &&
    /"[A-Za-z0-9_]+":/.test(text)
  ) {
    return true;
  }

  const fieldLikeMatches = text.match(/"[A-Za-z0-9_]+":/g) ?? [];
  if (fieldLikeMatches.length >= 4) {
    return true;
  }

  const suspiciousKeywords = [
    "clientModel",
    "amount",
    "createTime",
    "creatorName",
    "currency",
    "companyAddress",
    "totalAvailableAmount",
    "convertedAmount",
    "principal",
    "warehouseAddress",
  ];

  const matchedKeywordCount = suspiciousKeywords.filter((keyword) =>
    text.includes(keyword),
  ).length;

  return matchedKeywordCount >= 3;
}

function sanitizeTrackText(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (isStructuredNoiseText(text)) return "";

  return text;
}

function isTongtuTrackContainerKey(key: string) {
  const normalized = normalizeFieldKey(key);

  return (
    [
      "track",
      "tracks",
      "traces",
      "trace",
      "trajectory",
      "trajectorylist",
      "tracklist",
      "tracelist",
      "nodelist",
      "eventlist",
      "history",
      "historylist",
      "record",
      "records",
      "guiji",
      "guijilist",
    ].includes(normalized) ||
    normalized.includes("track") ||
    normalized.includes("trace") ||
    normalized.includes("trajectory") ||
    normalized.includes("guiji") ||
    normalized.includes("history") ||
    normalized.includes("record") ||
    key.includes("轨迹") ||
    key.includes("跟踪") ||
    key.includes("记录") ||
    key.includes("历程") ||
    key.includes("节点")
  );
}

function hasLikelyDateTimeValue(value: unknown) {
  return Boolean(normalizeDateTimeText(value));
}

function hasLikelyTrackTimeField(row: Record<string, unknown>) {
  if (hasAnyField(row, TONGTU_TRACK_TIME_FIELDS)) {
    return Boolean(getTextField(row, TONGTU_TRACK_TIME_FIELDS));
  }

  return Object.entries(row).some(([key, value]) => {
    const normalized = normalizeFieldKey(key);
    return (
      (normalized.includes("time") ||
        normalized.includes("date") ||
        normalized.includes("riqi") ||
        normalized.includes("shijian") ||
        key.includes("时间") ||
        key.includes("日期")) &&
      hasLikelyDateTimeValue(value)
    );
  });
}

function getTrackEventTime(row: Record<string, unknown>) {
  const explicitText = getTextField(row, TONGTU_TRACK_TIME_FIELDS);
  if (explicitText) {
    return normalizeDateTimeText(explicitText);
  }

  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizeFieldKey(key);
    if (
      normalized.includes("time") ||
      normalized.includes("date") ||
      normalized.includes("riqi") ||
      normalized.includes("shijian") ||
      key.includes("时间") ||
      key.includes("日期")
    ) {
      const parsed = normalizeDateTimeText(value);
      if (parsed) return parsed;
    }
  }

  return "";
}

function getTrackDescription(row: Record<string, unknown>) {
  const explicitText = getTextField(row, TONGTU_TRACK_DESCRIPTION_FIELDS);
  if (explicitText) return sanitizeTrackText(explicitText);

  const fallbackTexts = Object.entries(row)
    .filter(([key]) => {
      const normalized = normalizeFieldKey(key);
      return !(
        normalized === "id" ||
        normalized.endsWith("id") ||
        normalized === "index" ||
        normalized === "sort" ||
        normalized === "seq" ||
        normalized === "no" ||
        isTongtuTrackContainerKey(key)
      );
    })
    .map(([, value]) => getOptionalText(value))
    .map((value) => sanitizeTrackText(value))
    .filter((value) => value && !normalizeDateTimeText(value))
    .slice(0, 3);

  return sanitizeTrackText(fallbackTexts.join("；"));
}

function getTrackLocation(row: Record<string, unknown>) {
  return getTextField(row, TONGTU_TRACK_LOCATION_FIELDS);
}

function getChildWaybillNo(row: Record<string, unknown>) {
  return getTextField(row, TONGTU_TRACK_CHILD_WAYBILL_FIELDS);
}

function isLikelyTongtuTrackRow(row: Record<string, unknown>) {
  const hasTime = hasLikelyTrackTimeField(row);
  const description = getTrackDescription(row);
  const location = getTrackLocation(row);
  const childWaybillNo = getChildWaybillNo(row);

  if (hasTime && (description || location || childWaybillNo)) {
    return true;
  }

  return false;
}

function collectTongtuTrackRows(
  value: unknown,
  depth = 0,
): Array<Record<string, unknown>> {
  if (!value || depth > 6) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTongtuTrackRows(item, depth + 1));
  }

  if (typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const currentRows = isLikelyTongtuTrackRow(record) ? [record] : [];
  const preferredNestedRows = Object.entries(record).flatMap(([key, item]) =>
    isTongtuTrackContainerKey(key)
      ? collectTongtuTrackRows(item, depth + 1)
      : [],
  );
  const nestedRows =
    preferredNestedRows.length > 0
      ? preferredNestedRows
      : Object.values(record).flatMap((item) =>
          collectTongtuTrackRows(item, depth + 1),
        );

  return [...currentRows, ...nestedRows];
}

function joinTrackContent(description: string, location: string, childWaybillNo: string) {
  const parts = [description];

  if (location && !description.includes(location)) {
    parts.push(`位置：${location}`);
  }

  if (childWaybillNo && !description.includes(childWaybillNo)) {
    parts.push(`子转单号：${childWaybillNo}`);
  }

  return sanitizeTrackText(parts.filter(Boolean).join("；"));
}

function inferYearForMonthDay(month: number, day: number, referenceDate: Date) {
  const candidate = new Date(Date.UTC(referenceDate.getUTCFullYear(), month - 1, day));
  const referenceMidnight = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  );
  const diffDays = Math.round((candidate.getTime() - referenceMidnight) / 86400000);

  if (diffDays > 31) {
    candidate.setUTCFullYear(candidate.getUTCFullYear() - 1);
  } else if (diffDays < -335) {
    candidate.setUTCFullYear(candidate.getUTCFullYear() + 1);
  }

  return candidate;
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseMonthDayToDateText(
  month: number,
  day: number,
  referenceDate: Date,
) {
  if (!Number.isFinite(month) || !Number.isFinite(day)) return null;

  return formatDateOnly(inferYearForMonthDay(month, day, referenceDate));
}

function extractKeywordBusinessDate(
  content: string,
  keywords: string[],
  time: string,
) {
  const referenceDate = time ? new Date(time) : new Date();

  for (const keyword of keywords) {
    const keywordIndex = content.indexOf(keyword);
    if (keywordIndex < 0) continue;

    const beforeText = content.slice(0, keywordIndex + keyword.length);
    const fullDateMatches = Array.from(
      beforeText.matchAll(
        /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?/g,
      ),
    );
    const lastFullDateMatch = fullDateMatches.at(-1);

    if (lastFullDateMatch) {
      const year = Number(lastFullDateMatch[1]);
      const month = Number(lastFullDateMatch[2]);
      const day = Number(lastFullDateMatch[3]);
      const candidate = new Date(Date.UTC(year, month - 1, day));

      if (!Number.isNaN(candidate.getTime())) {
        return formatDateOnly(candidate);
      }
    }

    const monthDayMatches = Array.from(
      beforeText.matchAll(/(^|[^\d])(\d{1,2})[-/.月](\d{1,2})(?:日)?/g),
    );
    const lastMonthDayMatch = monthDayMatches.at(-1);

    if (lastMonthDayMatch) {
      const month = Number(lastMonthDayMatch[2]);
      const day = Number(lastMonthDayMatch[3]);
      const parsed = parseMonthDayToDateText(month, day, referenceDate);
      if (parsed) return parsed;
    }
  }

  return null;
}

function extractBusinessDate(content: string, time: string) {
  const referenceDate = time ? new Date(time) : new Date();

  const fullDateMatch = content.match(
    /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?/,
  );
  if (fullDateMatch) {
    const [, yearText, monthText, dayText] = fullDateMatch;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const candidate = new Date(Date.UTC(year, month - 1, day));

    if (!Number.isNaN(candidate.getTime())) {
      return formatDateOnly(candidate);
    }
  }

  const monthDayMatch = content.match(/(^|[^\d])(\d{1,2})[-/.月](\d{1,2})(?:日)?(?!\d)/);
  if (!monthDayMatch) return time ? time.slice(0, 10) : null;

  const month = Number(monthDayMatch[2]);
  const day = Number(monthDayMatch[3]);
  return parseMonthDayToDateText(month, day, referenceDate) ??
    (time ? time.slice(0, 10) : null);
}

function normalizeTrackEvent(row: Record<string, unknown>, index: number): TongtuTrackEvent {
  const description = getTrackDescription(row);
  const location = getTrackLocation(row);
  const childWaybillNo = getChildWaybillNo(row);
  const content = joinTrackContent(description, location, childWaybillNo);
  const time = getTrackEventTime(row);

  return {
    index,
    content,
    time,
    businessDate: extractBusinessDate(description, time),
    row,
  };
}

function getEventTimestamp(event: { time: string; index: number }) {
  const timestamp = Date.parse(event.time);
  return Number.isNaN(timestamp) ? event.index : timestamp;
}

function findFirstMatchedDate(
  events: TongtuTrackEvent[],
  keywords: string[],
  options?: { useBusinessDate?: boolean },
) {
  const matchedEvent = events.find(
    (event) =>
      event.content &&
      keywords.some((keyword) => event.content.includes(keyword)),
  );

  if (!matchedEvent) return null;

  if (options?.useBusinessDate) {
    return (
      extractKeywordBusinessDate(matchedEvent.content, keywords, matchedEvent.time) ??
      matchedEvent.businessDate ??
      (matchedEvent.time ? matchedEvent.time.slice(0, 10) : null)
    );
  }

  return matchedEvent.time ? matchedEvent.time.slice(0, 10) : matchedEvent.businessDate;
}

function parseTongtuTrackResult(value: unknown) {
  const sourceRows = collectTongtuTrackRows(value);
  const events = sourceRows
    .map(normalizeTrackEvent)
    .filter((event) => event.content || event.time);
  const orderedByTimeAsc = [...events].sort(
    (left, right) => getEventTimestamp(left) - getEventTimestamp(right),
  );
  const orderedByTimeDesc = [...events].sort(
    (left, right) => getEventTimestamp(right) - getEventTimestamp(left),
  );
  const latestEvent = orderedByTimeDesc[0];
  const sailingTime = findFirstMatchedDate(orderedByTimeAsc, ["已开船"]);
  const warehouseArrivedTime = findFirstMatchedDate(orderedByTimeAsc, [
    "海外仓",
  ]);

  return {
    events: orderedByTimeDesc,
    latestTrack: latestEvent?.content || "",
    trackUpdatedAt: latestEvent?.time || new Date().toISOString(),
    sailingTime,
    warehouseArrivedTime,
  };
}

function getPayloadSummary(payload: unknown) {
  const text = JSON.stringify(payload);
  return text.length > 1000 ? `${text.slice(0, 1000)}...` : text;
}

async function loginTongtuCredential(params: {
  baseUrl: string;
  username: string;
  password: string;
  label: "primary" | "fallback";
}) {
  const websocketToken = createTongtuId();
  const visitorId = createTongtuId();
  const token = await loginTongtu({
    baseUrl: params.baseUrl,
    username: params.username,
    password: params.password,
    logScope: LOG_SCOPE,
  });

  return {
    label: params.label,
    token,
    websocketToken,
    visitorId,
  };
}

async function queryTongtuTrackWithSession(params: {
  baseUrl: string;
  token: string;
  websocketToken: string;
  visitorId: string;
  shipmentNo: string;
  trackingNo: string;
}) {
  const queryResult = await queryTongtuWaybill({
    baseUrl: params.baseUrl,
    token: params.token,
    shipmentNo: params.shipmentNo,
    trackingNo: params.trackingNo,
    websocketToken: params.websocketToken,
    visitorId: params.visitorId,
    logScope: LOG_SCOPE,
    returnMatchedRowWithoutWaybill: true,
  });

  if (queryResult.error) {
    throw new Error(queryResult.error);
  }

  const waybillDetail = queryResult.waybillId
    ? await fetchTongtuWaybillDetail({
        baseUrl: params.baseUrl,
        token: params.token,
        waybillId: queryResult.waybillId,
        websocketToken: params.websocketToken,
        visitorId: params.visitorId,
        logScope: LOG_SCOPE,
      })
    : null;

  return {
    queryResult,
    waybillDetail,
  };
}

async function queryTongtuTrackWithBusinessFallback(params: {
  baseUrl: string;
  username: string;
  password: string;
  shipmentNo: string;
  trackingNo: string;
}): Promise<{
  queryResult: TongtuWaybillQueryResult;
  waybillDetail: unknown;
  usedFallback: boolean;
}> {
  const primarySession = await loginTongtuCredential({
    baseUrl: params.baseUrl,
    username: params.username,
    password: params.password,
    label: "primary",
  });

  try {
    return {
      ...(await queryTongtuTrackWithSession({
        baseUrl: params.baseUrl,
        token: primarySession.token,
        websocketToken: primarySession.websocketToken,
        visitorId: primarySession.visitorId,
        shipmentNo: params.shipmentNo,
        trackingNo: params.trackingNo,
      })),
      usedFallback: false,
    };
  } catch (error) {
    const primaryBusinessError =
      error instanceof Error ? error.message : "通途业务接口查询失败";

    logTongtuResponse(LOG_SCOPE, "business query fallback", {
      primaryBusinessError,
      fallbackUsername: TONGTU_FALLBACK_USERNAME,
    });
  }

  const fallbackSession = await loginTongtuCredential({
    baseUrl: params.baseUrl,
    username: TONGTU_FALLBACK_USERNAME,
    password: TONGTU_FALLBACK_PASSWORD,
    label: "fallback",
  });

  return {
    ...(await queryTongtuTrackWithSession({
      baseUrl: params.baseUrl,
      token: fallbackSession.token,
      websocketToken: fallbackSession.websocketToken,
      visitorId: fallbackSession.visitorId,
      shipmentNo: params.shipmentNo,
      trackingNo: params.trackingNo,
    })),
    usedFallback: true,
  };
}

export async function POST(request: Request) {
  try {
    await verifyShipmentTrackOperator();

    const body = (await request.json()) as TongtuTrackUpdateRequestBody;
    const trackId = getRequiredText(body.trackId, "缺少货件轨迹ID");
    const adminClient = createSupabaseAdminClient();
    const { data: trackData, error: trackError } = await adminClient
      .from("shipment_tracks")
      .select(
        "id, shipment_record_id, shipment:shipment_records!inner(id, shipment_no, tracking_no, logistics_provider, status)",
      )
      .eq("id", trackId)
      .eq("shipment.status", "有效")
      .single();

    if (trackError) {
      throw trackError;
    }

    const track = trackData as ShipmentTrackRow;
    const shipment = Array.isArray(track.shipment)
      ? track.shipment[0]
      : track.shipment;
    const providerName = shipment?.logistics_provider?.trim() || "";
    const shipmentNo = getRequiredText(
      shipment?.shipment_no,
      "当前货件缺少货件号",
    );
    const trackingNo = getOptionalText(shipment?.tracking_no);

    if (providerName !== "通途") {
      throw new Error("当前货件不是通途物流商，不能查询通途轨迹");
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
    const { queryResult, waybillDetail, usedFallback } =
      await queryTongtuTrackWithBusinessFallback({
      baseUrl,
      username,
      password,
      shipmentNo,
      trackingNo,
    });

    if (!queryResult.row) {
      throw new Error(`通途已下单货件中未找到客户单号为 ${shipmentNo} 的数据`);
    }

    if (!queryResult.matchedShipmentNo) {
      throw new Error(`通途已下单货件中未找到客户单号为 ${shipmentNo} 的数据`);
    }

    const detailTrack = parseTongtuTrackResult(waybillDetail);
    const parsedTrack =
      detailTrack.events.length > 0
        ? detailTrack
        : parseTongtuTrackResult(queryResult.row);

    logTongtuResponse(LOG_SCOPE, "tracks parsed", {
      shipmentNo,
      trackingNo,
      waybillId: queryResult.waybillId,
      latestTrack: parsedTrack.latestTrack,
      sailingTime: parsedTrack.sailingTime,
      warehouseArrivedTime: parsedTrack.warehouseArrivedTime,
      trackUpdatedAt: parsedTrack.trackUpdatedAt,
      eventCount: parsedTrack.events.length,
      credential: usedFallback ? "fallback" : "primary",
    });

    if (!parsedTrack.latestTrack) {
      throw new Error(
        `通途轨迹查询结果为空：${getPayloadSummary(waybillDetail ?? queryResult.row)}`,
      );
    }

    const updateValues = {
      latest_track: parsedTrack.latestTrack,
      track_events: parsedTrack.events.map((event) => ({
        time: event.time || null,
        content: event.content,
      })),
      track_updated_at: parsedTrack.trackUpdatedAt,
    };
    const { data: updatedData, error: updateError } = await adminClient
      .from("shipment_tracks")
      .update(updateValues)
      .eq("id", trackId)
      .select(
        "id, shipment_record_id, latest_track, track_events, sailing_time, warehouse_arrived_time, track_updated_at, created_at, updated_at, shipment:shipment_records!inner(shipment_no, tracking_no, logistics_provider, product_name)",
      )
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      data: updatedData,
      trackEvents: parsedTrack.events.map((event) => ({
        time: event.time || null,
        content: event.content,
      })),
      matchedCount: parsedTrack.events.length,
      waybillId: queryResult.waybillId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "通途轨迹更新失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
