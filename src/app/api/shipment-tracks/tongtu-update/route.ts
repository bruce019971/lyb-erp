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
  const dateText = matched?.[0] ?? text;
  const normalized = dateText.replace(/\//g, "-").replace(" ", "T");
  const timestamp = Date.parse(normalized);

  if (Number.isNaN(timestamp)) return "";

  return new Date(timestamp).toISOString();
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
  const currentRows =
    hasAnyField(record, [
      "miaoshu",
      "description",
      "desc",
      "remark",
      "track",
      "trackremark",
      "trackcontent",
      "content",
      "status",
      "nodename",
      "guiji",
      "轨迹",
      "描述",
      "内容",
      "状态",
    ]) &&
    hasAnyField(record, [
      "sj",
      "time",
      "tracktime",
      "eventtime",
      "operatetime",
      "operationtime",
      "createtime",
      "createdtime",
      "updatetime",
      "updatedtime",
      "date",
      "日期",
      "时间",
      "轨迹时间",
      "操作时间",
    ])
      ? [record]
      : [];
  const nestedRows = Object.values(record).flatMap((item) =>
    collectTongtuTrackRows(item, depth + 1),
  );

  return [...currentRows, ...nestedRows];
}

function getTrackEventTime(row: Record<string, unknown>) {
  return normalizeDateTimeText(
    getTextField(row, [
      "sj",
      "time",
      "tracktime",
      "eventtime",
      "operatetime",
      "operationtime",
      "createtime",
      "createdtime",
      "updatetime",
      "updatedtime",
      "date",
      "日期",
      "时间",
      "轨迹时间",
      "操作时间",
    ]),
  );
}

function getTrackDescription(row: Record<string, unknown>) {
  return (
    getTextField(row, [
      "miaoshu",
      "description",
      "desc",
      "remark",
      "trackremark",
      "trackcontent",
      "content",
      "status",
      "nodename",
      "trackname",
      "guiji",
      "轨迹",
      "描述",
      "内容",
      "状态",
    ]) || JSON.stringify(row)
  );
}

function getTrackLocation(row: Record<string, unknown>) {
  return getTextField(row, [
    "location",
    "address",
    "area",
    "position",
    "place",
    "city",
    "country",
    "位置",
    "地区",
    "地址",
  ]);
}

function getChildWaybillNo(row: Record<string, unknown>) {
  return getTextField(row, [
    "childtrackingno",
    "childwaybillno",
    "subtrackingno",
    "subwaybillno",
    "transferno",
    "转单号",
    "子转单号",
    "子单号",
  ]);
}

function joinTrackContent(description: string, location: string, childWaybillNo: string) {
  const parts = [description];

  if (location && !description.includes(location)) {
    parts.push(`位置：${location}`);
  }

  if (childWaybillNo && !description.includes(childWaybillNo)) {
    parts.push(`子转单号：${childWaybillNo}`);
  }

  return parts.filter(Boolean).join("；");
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
  if (!Number.isFinite(month) || !Number.isFinite(day)) {
    return time ? time.slice(0, 10) : null;
  }

  return formatDateOnly(inferYearForMonthDay(month, day, referenceDate));
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
    return matchedEvent.businessDate ?? (matchedEvent.time ? matchedEvent.time.slice(0, 10) : null);
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
  const sailingTime = findFirstMatchedDate(
    orderedByTimeAsc,
    ["已开船", "开船", "开航", "启航", "离港", "已发船", "sailing", "depart"],
    { useBusinessDate: true },
  );
  const warehouseArrivedTime =
    findFirstMatchedDate(
      orderedByTimeAsc,
      ["海外仓", "已到仓", "到仓", "入仓", "抵仓", "已入库", "已入仓", "warehouse", "arriv"],
      { useBusinessDate: true },
    ) ||
    findFirstMatchedDate(
      orderedByTimeAsc,
      ["理货上架", "已上架", "上架"],
      { useBusinessDate: true },
    );

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
    const websocketToken = createTongtuId();
    const visitorId = createTongtuId();
    const token = await loginTongtu({
      baseUrl,
      username,
      password,
      logScope: LOG_SCOPE,
    });
    const queryResult = await queryTongtuWaybill({
      baseUrl,
      token,
      shipmentNo,
      trackingNo,
      websocketToken,
      visitorId,
      logScope: LOG_SCOPE,
      returnMatchedRowWithoutWaybill: true,
    });

    if (!queryResult.row) {
      throw new Error(
        queryResult.error ||
          `通途已下单货件中未找到客户单号为 ${shipmentNo} 的数据`,
      );
    }

    if (!queryResult.matchedShipmentNo) {
      throw new Error(`通途已下单货件中未找到客户单号为 ${shipmentNo} 的数据`);
    }

    const waybillDetail = queryResult.waybillId
      ? await fetchTongtuWaybillDetail({
          baseUrl,
          token,
          waybillId: queryResult.waybillId,
          websocketToken,
          visitorId,
          logScope: LOG_SCOPE,
        })
      : null;
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
      sailing_time: parsedTrack.sailingTime,
      warehouse_arrived_time: parsedTrack.warehouseArrivedTime,
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
