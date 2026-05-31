import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { syncShipmentWarehouseArrivedAt } from "../_shipment-warehouse-sync";
import { RISHENGHUI_TPL_LIST_VALUES_URL } from "../../logistics/rishenghui/_lib";

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

type RishenghuiTrackUpdateRequestBody = {
  trackId?: string;
  accessToken?: string;
};

type ShipmentTrackRow = {
  id: string;
  shipment_record_id: string;
  warehouse_arrived_time: string | null;
  shipment:
    | {
        id: string;
        shipment_no: string | null;
        tracking_no: string | null;
        logistics_provider: string | null;
        created_at: string | null;
      }
    | Array<{
        id: string;
        shipment_no: string | null;
        tracking_no: string | null;
        logistics_provider: string | null;
        created_at: string | null;
      }>
    | null;
};

type RishenghuiTrackPayload =
  | Array<Record<string, unknown>>
  | {
      data?:
        | Array<Record<string, unknown>>
        | {
            records?: Array<Record<string, unknown>>;
            rows?: Array<Record<string, unknown>>;
            list?: Array<Record<string, unknown>>;
          };
      result?: Array<Record<string, unknown>>;
      rows?: Array<Record<string, unknown>>;
      list?: Array<Record<string, unknown>>;
      records?: Array<Record<string, unknown>>;
      message?: unknown;
      msg?: unknown;
      error?: unknown;
    }
  | null;

const DAY_MS = 24 * 60 * 60 * 1000;
const RISHENGHUI_ORDERMX_PAGE_SIZE = 100;
const RISHENGHUI_ORDERMX_MAX_PAGES = 20;
const RISHENGHUI_ORDERMX_LOOKBACK_DAYS = 90;

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
  const roleData = Array.isArray(operator.role) ? operator.role[0] : operator.role;
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

function getRequiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

function getPayloadError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";

  const result = payload as {
    message?: unknown;
    msg?: unknown;
    error?: unknown;
  };

  for (const value of [result.message, result.msg, result.error]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function getPayloadSummary(payload: unknown) {
  const text = JSON.stringify(payload);
  return text.length > 800 ? `${text.slice(0, 800)}...` : text;
}

function normalizeKey(key: string) {
  return key.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "").toLowerCase();
}

function getRows(payload: RishenghuiTrackPayload) {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object",
    );
  }

  if (!payload || typeof payload !== "object") return [];

  const candidateLists = [
    payload.data,
    payload.result,
    payload.rows,
    payload.list,
    payload.records,
  ];

  for (const candidate of candidateLists) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      );
    }

    if (candidate && typeof candidate === "object") {
      const nested = candidate as {
        records?: Array<Record<string, unknown>>;
        rows?: Array<Record<string, unknown>>;
        list?: Array<Record<string, unknown>>;
      };

      for (const nestedCandidate of [
        nested.records,
        nested.rows,
        nested.list,
      ]) {
        if (Array.isArray(nestedCandidate)) {
          return nestedCandidate.filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === "object",
          );
        }
      }
    }
  }

  return [];
}

function hasAnyField(row: Record<string, unknown>, fieldNames: readonly string[]) {
  const normalizedFieldNames = fieldNames.map(normalizeKey);

  return Object.keys(row).some((key) =>
    normalizedFieldNames.includes(normalizeKey(key)),
  );
}

function collectTrackRows(value: unknown, depth = 0): Array<Record<string, unknown>> {
  if (!value || depth > 6) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTrackRows(item, depth + 1));
  }

  if (typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const currentRows =
    hasAnyField(record, ["guiji", "轨迹", "track", "remark"]) &&
    hasAnyField(record, [
      "zztm",
      "sj",
      "time",
      "tracktime",
      "轨迹时间",
      "时间",
      "createtime",
      "createdtime",
      "updatetime",
      "updatedtime",
    ])
      ? [record]
      : [];
  const nestedRows = Object.values(record).flatMap((item) =>
    collectTrackRows(item, depth + 1),
  );

  return [...currentRows, ...nestedRows];
}

function getTextField(row: Record<string, unknown>, fieldNames: readonly string[]) {
  const normalizedFieldNames = fieldNames.map(normalizeKey);

  for (const [key, value] of Object.entries(row)) {
    if (!normalizedFieldNames.includes(normalizeKey(key))) continue;

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function normalizeDateTimeText(value: unknown) {
  const text =
    typeof value === "string"
      ? value.trim()
      : typeof value === "number" && Number.isFinite(value)
        ? String(value)
        : "";
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

function getRishenghuiTrackTime(row: Record<string, unknown>) {
  return normalizeDateTimeText(
    getTextField(row, [
      "zztm",
      "sj",
      "time",
      "tracktime",
      "轨迹时间",
      "时间",
      "createtime",
      "createdtime",
      "updatetime",
      "updatedtime",
    ]),
  );
}

function normalizeTrackEvent(row: Record<string, unknown>, index: number) {
  const content = getTextField(row, ["guiji", "轨迹", "track", "remark"]);

  return {
    index,
    content,
    time: getRishenghuiTrackTime(row),
    row,
  };
}

function getEventTimestamp(event: { time: string; index: number }) {
  const timestamp = Date.parse(event.time);
  return Number.isNaN(timestamp) ? event.index : timestamp;
}

function dateOnly(value: string) {
  return value ? value.slice(0, 10) : null;
}

function findRishenghuiWarehouseArrivedTime(
  events: Array<{ content: string; time: string }>,
) {
  const arrivedEvent = events.find(
    (event) =>
      event.time &&
      event.content.includes("已到仓"),
  );

  return arrivedEvent?.time ? dateOnly(arrivedEvent.time) : null;
}

function findRishenghuiSailingTime(
  events: Array<{ content: string; time: string }>,
) {
  const sailingEvent = events.find(
    (event) =>
      event.time &&
      ["已开船", "开船", "开航", "启航", "离港", "已发船"].some((keyword) =>
        event.content.includes(keyword),
      ),
  );

  return sailingEvent?.time ? dateOnly(sailingEvent.time) : null;
}

function formatRishenghuiDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);

  return date;
}

function addDays(value: Date, days: number) {
  return new Date(startOfDay(value).getTime() + days * DAY_MS);
}

function parseDate(value: string | null | undefined) {
  if (!value?.trim()) return null;

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;

  return new Date(timestamp);
}

function createRishenghuiOrderDateRanges(seedDateText: string | null | undefined) {
  const today = startOfDay(new Date());
  const seedDate = parseDate(seedDateText);
  const ranges: Array<{ start: string; end: string; label: string }> = [];
  const rangeKeys = new Set<string>();

  const pushRange = (startDate: Date, endDate: Date, label: string) => {
    const normalizedStart = startOfDay(startDate);
    const normalizedEnd = startOfDay(endDate);
    const startTime = Math.min(normalizedStart.getTime(), normalizedEnd.getTime());
    const endTime = Math.min(
      Math.max(normalizedStart.getTime(), normalizedEnd.getTime()),
      today.getTime(),
    );
    const start = formatRishenghuiDate(new Date(startTime));
    const end = formatRishenghuiDate(new Date(endTime));
    const key = `${start}-${end}`;

    if (rangeKeys.has(key)) return;

    rangeKeys.add(key);
    ranges.push({ start, end, label });
  };

  if (seedDate) {
    pushRange(seedDate, seedDate, "shipment-created-date");
    pushRange(addDays(seedDate, -7), addDays(seedDate, 7), "shipment-created-window");
  }

  pushRange(today, today, "today");
  pushRange(addDays(today, -7), today, "recent-7-days");
  pushRange(addDays(today, -RISHENGHUI_ORDERMX_LOOKBACK_DAYS), today, "recent-90-days");

  return ranges;
}

function isSamePackNo(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function getPackNo(row: Record<string, unknown>) {
  return getTextField(row, [
    "packno",
    "pack_no",
    "运单编号",
    "运单号",
    "物流单号",
    "快递单号",
  ]);
}

function getOrderNo(row: Record<string, unknown>) {
  return getTextField(row, [
    "orderno",
    "order_no",
    "订单编号",
    "订单号",
    "日升辉订单号",
  ]);
}

async function fetchRishenghuiOrderNo(params: {
  accessToken: string;
  trackingNo: string;
  shipmentCreatedAt?: string | null;
}) {
  const dateRanges = createRishenghuiOrderDateRanges(params.shipmentCreatedAt);
  let lastPayload: RishenghuiTrackPayload | null = null;

  for (const range of dateRanges) {
    for (let pageNo = 1; pageNo <= RISHENGHUI_ORDERMX_MAX_PAGES; pageNo += 1) {
      const requestPayload = {
        pagesize: RISHENGHUI_ORDERMX_PAGE_SIZE,
        pageno: pageNo,
        reportno: "ORDERMX",
        opentype: "find",
        colen: "find",
        userquery1: range.start,
        userquery2: range.end,
        userquery4: "allqty",
        userquery3: "%",
        userquery6: "%",
      };
      const response = await fetch(RISHENGHUI_TPL_LIST_VALUES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });
      const result = (await response.json().catch(() => null)) as
        | RishenghuiTrackPayload
        | null;
      lastPayload = result;

      console.log("[rishenghui-track-update] ORDERMX response", {
        request: {
          reportno: requestPayload.reportno,
          dateRange: `${range.start}-${range.end}`,
          rangeLabel: range.label,
          pageno: pageNo,
          trackingNo: params.trackingNo,
        },
        status: response.status,
        result: getPayloadSummary(result),
      });

      if (!response.ok) {
        throw new Error(getPayloadError(result) || "日升辉订单明细查询失败");
      }

      const rows = getRows(result);
      const matchedRow = rows.find((row) =>
        isSamePackNo(getPackNo(row), params.trackingNo),
      );
      const orderNo = matchedRow ? getOrderNo(matchedRow) : "";

      if (orderNo) {
        return {
          orderNo,
          row: matchedRow,
          payload: result,
          requestPayload,
        };
      }

      if (rows.length < RISHENGHUI_ORDERMX_PAGE_SIZE) break;
    }
  }

  throw new Error(
    `日升辉ORDERMX未找到运单编号${params.trackingNo}对应订单号：${getPayloadSummary(lastPayload)}`,
  );
}

function parseRishenghuiTracks(rows: Array<Record<string, unknown>>) {
  const events = rows
    .map(normalizeTrackEvent)
    .filter((event) => event.content)
    .sort((left, right) => getEventTimestamp(right) - getEventTimestamp(left));
  const latestEvent = events[0];

  return {
    events,
    latestTrack: latestEvent?.content || "",
    trackUpdatedAt: latestEvent?.time || new Date().toISOString(),
    sailingTime: findRishenghuiSailingTime(events),
    warehouseArrivedTime: findRishenghuiWarehouseArrivedTime(events),
  };
}

export async function POST(request: Request) {
  try {
    await verifyShipmentTrackOperator();

    const body = (await request.json()) as RishenghuiTrackUpdateRequestBody;
    const trackId = getRequiredText(body.trackId, "缺少货件轨迹ID");
    const accessToken = getRequiredText(body.accessToken, "请先获取日升辉Token");
    const adminClient = createSupabaseAdminClient();
    const { data: trackData, error: trackError } = await adminClient
      .from("shipment_tracks")
      .select(
        "id, shipment_record_id, warehouse_arrived_time, shipment:shipment_records!inner(id, shipment_no, tracking_no, logistics_provider, created_at, status)",
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
    const trackingNo = getRequiredText(
      shipment?.tracking_no,
      "当前货件缺少运单编号",
    );

    if (providerName !== "日升辉") {
      throw new Error("当前货件不是日升辉物流商，不能查询日升辉轨迹");
    }

    const orderLookupResult = await fetchRishenghuiOrderNo({
      accessToken,
      trackingNo,
      shipmentCreatedAt: shipment?.created_at,
    });
    const requestPayload = {
      reportno: "TRACKING",
      opentype: "find",
      colen: "find",
      userquery1: orderLookupResult.orderNo,
      userquery2: "%",
    };
    const response = await fetch(RISHENGHUI_TPL_LIST_VALUES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    });
    const result = (await response.json().catch(() => null)) as
      | RishenghuiTrackPayload
      | null;

    console.log("[rishenghui-track-update] tracking response", {
      request: {
        ...requestPayload,
        trackingNo,
      },
      status: response.status,
      result,
    });

    if (!response.ok) {
      throw new Error(getPayloadError(result) || "日升辉轨迹查询失败");
    }

    const rows = getRows(result);
    const trackRows = rows.length ? rows : collectTrackRows(result);
    const resolvedEventsResult = parseRishenghuiTracks(trackRows);

    if (!resolvedEventsResult.latestTrack) {
      throw new Error(
        `日升辉轨迹查询结果为空：${getPayloadSummary(result)}`,
      );
    }

    const updateValues = {
      latest_track: resolvedEventsResult.latestTrack,
      track_events: resolvedEventsResult.events.map((event) => ({
        time: event.time || null,
        content: event.content,
      })),
      sailing_time: resolvedEventsResult.sailingTime,
      warehouse_arrived_time:
        resolvedEventsResult.warehouseArrivedTime ||
        track.warehouse_arrived_time,
      track_updated_at: resolvedEventsResult.trackUpdatedAt,
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

    await syncShipmentWarehouseArrivedAt({
      adminClient,
      shipmentRecordId: track.shipment_record_id,
      previousWarehouseArrivedTime: track.warehouse_arrived_time,
      nextWarehouseArrivedTime: updateValues.warehouse_arrived_time,
    });

    return NextResponse.json({
      data: updatedData,
      trackEvents: resolvedEventsResult.events.map((event) => ({
        time: event.time || null,
        content: event.content,
      })),
      matchedCount: resolvedEventsResult.events.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "日升辉轨迹更新失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
