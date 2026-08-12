import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { syncShipmentWarehouseArrivedAt } from "../_shipment-warehouse-sync";
import {
  SALEASY_TRANSPORT_PLAN_LIST_PATH,
  SALEASY_TRANSPORT_PLAN_QUERY_TRACKS_PATH,
  extractRows,
  getOptionalText,
  getRequiredText,
  logSaleasyResponse,
  loginSaleasy,
  normalizeComparableText,
  normalizeSaleasyBaseUrl,
  recordContainsText,
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

type SaleasyTrackUpdateRequestBody = {
  trackId?: string;
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
        overseas_warehouse_arrived_at: string | null;
      }
    | Array<{
        id: string;
        shipment_no: string | null;
        tracking_no: string | null;
        logistics_provider: string | null;
        overseas_warehouse_arrived_at: string | null;
      }>
    | null;
};

type LogisticsProviderRow = {
  system_url: string | null;
  username: string | null;
  password: string | null;
};

const LOG_SCOPE = "saleasy-track-update";

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

function normalizeFieldKey(key: string) {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function getRecursiveFieldText(
  value: unknown,
  normalizedFieldNames: readonly string[],
  depth = 0,
): string {
  if (!value || depth > 5) return "";

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = getRecursiveFieldText(
        item,
        normalizedFieldNames,
        depth + 1,
      );
      if (result) return result;
    }

    return "";
  }

  const record = toRecord(value);
  if (!record) return getOptionalText(value);

  for (const [key, item] of Object.entries(record)) {
    if (!normalizedFieldNames.includes(normalizeFieldKey(key))) continue;

    const text = getOptionalText(item);
    if (text) return text;
  }

  for (const item of Object.values(record)) {
    const result = getRecursiveFieldText(
      item,
      normalizedFieldNames,
      depth + 1,
    );
    if (result) return result;
  }

  return "";
}

function getTransportPlanId(row: unknown) {
  return getRecursiveFieldText(row, ["id", "planid", "transportplanid"]);
}

function getLogisticsWarehouseId(row: unknown) {
  return getRecursiveFieldText(row, [
    "logisticswarehouseid",
    "warehouseid",
  ]);
}

function findTransportPlanRow(rows: unknown[], shipmentNo: string, trackingNo: string) {
  const normalizedShipmentNo = normalizeComparableText(shipmentNo);
  const normalizedTrackingNo = normalizeComparableText(trackingNo);

  return (
    rows.find((row) => {
      if (normalizedShipmentNo && recordContainsText(row, shipmentNo)) {
        return true;
      }

      if (normalizedTrackingNo && recordContainsText(row, trackingNo)) {
        return true;
      }

      return false;
    }) ?? (rows.length === 1 ? rows[0] : null)
  );
}

async function queryTransportPlan(params: {
  baseUrl: string;
  token: string;
  shipmentNo: string;
  trackingNo: string;
}) {
  const searchKeys = [params.shipmentNo, params.trackingNo].filter(Boolean);
  let lastRows: unknown[] = [];

  for (const searchKey of searchKeys) {
    const result = await requestSaleasyJson<unknown>({
      baseUrl: params.baseUrl,
      path: SALEASY_TRANSPORT_PLAN_LIST_PATH,
      token: params.token,
      body: {
        searchKey,
      },
      logScope: LOG_SCOPE,
      label: `transport plan list response ${searchKey}`,
      fallbackError: "赛易运输计划列表查询失败",
    });
    const rows = extractRows(result);
    lastRows = rows;
    const row = findTransportPlanRow(rows, params.shipmentNo, params.trackingNo);
    const planId = getTransportPlanId(row);
    const warehouseId = getLogisticsWarehouseId(row);

    if (row && planId && warehouseId) {
      return {
        row,
        rows,
        planId,
        warehouseId,
      };
    }
  }

  throw new Error(
    `赛易运输计划查询结果为空或缺少planId/warehouseId：${JSON.stringify(lastRows)}`,
  );
}

function normalizeDateTimeText(value: unknown) {
  const text = getOptionalText(value);
  if (!text) return "";

  const matched = text.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[ T]\d{1,2}:\d{1,2}(?::\d{1,2})?)?/);
  const dateText = matched?.[0] ?? text;
  const normalized = dateText.replace(/\//g, "-").replace(" ", "T");
  const timestamp = Date.parse(normalized);

  if (Number.isNaN(timestamp)) return "";

  return new Date(timestamp).toISOString();
}

function getTrackEventText(row: unknown) {
  const record = toRecord(row);
  if (!record) return getOptionalText(row);

  const text =
    getRecursiveFieldText(record, [
      "trackcnremark",
      "trackcontent",
      "content",
      "description",
      "message",
      "remark",
      "status",
      "statusname",
      "trackstatus",
      "trackstatusname",
      "nodename",
      "trackname",
      "name",
    ]) || getOptionalText(record);

  return text;
}

function getTrackEventTime(row: unknown) {
  return normalizeDateTimeText(
    getRecursiveFieldText(row, [
      "tracktime",
      "time",
      "eventtime",
      "operatetime",
      "operationtime",
      "createdtime",
      "createtime",
      "updatetime",
      "updatedtime",
    ]),
  );
}

function getTrackEventStatus(row: unknown) {
  return getRecursiveFieldText(row, ["trackstatus"]);
}

function normalizeTrackEvent(row: unknown, index: number) {
  return {
    index,
    content: getTrackEventText(row),
    status: getTrackEventStatus(row),
    time: getTrackEventTime(row),
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

function findEventDate(
  events: Array<{ content: string; time: string; index: number }>,
  keywords: string[],
) {
  const event = events
    .filter((item) => item.time)
    .find((item) => keywords.some((keyword) => item.content.includes(keyword)));

  return event ? dateOnly(event.time) : null;
}

function findEventDateByTrackStatus(
  events: Array<{ status: string; time: string }>,
  trackStatus: string,
) {
  const event = events
    .filter((item) => item.time)
    .find((item) => item.status === trackStatus);

  return event ? dateOnly(event.time) : null;
}

function isDateAfterToday(value: string) {
  if (!value) return false;

  const date = value.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  return date > today;
}

function getSaleasyTrackUpdatedAtByRawOrder(
  events: Array<{ time: string; index: number }>,
) {
  const orderedEvents = [...events].sort(
    (left, right) => left.index - right.index,
  );
  const firstTime = orderedEvents[0]?.time || "";
  const secondTime = orderedEvents[1]?.time || "";

  if (firstTime && isDateAfterToday(firstTime) && secondTime) {
    return secondTime;
  }

  return firstTime || secondTime || new Date().toISOString();
}

function parseTrackResult(payload: unknown) {
  const rows = extractRows(payload);
  const sourceRows = rows.length > 0 ? rows : [payload];
  const rawEvents = sourceRows
    .map(normalizeTrackEvent)
    .filter((event) => event.content);
  const events = [...rawEvents].sort(
    (left, right) => getEventTimestamp(left) - getEventTimestamp(right),
  );
  const latestEvent = [...rawEvents].sort(
    (left, right) => left.index - right.index,
  )[0];
  const latestTrack = latestEvent?.content || "";
  const trackUpdatedAt = getSaleasyTrackUpdatedAtByRawOrder(rawEvents);
  const sailingTime =
    findEventDateByTrackStatus(events, "LeavePort_70") ||
    findEventDate(events, [
      "开船",
      "开航",
      "启航",
      "离港",
      "已发船",
      "sailing",
      "depart",
    ]);
  const warehouseArrivedTime =
    findEventDateByTrackStatus(events, "ArriveProcessingCenter_120") ||
    findEventDate(events, [
      "到仓",
      "入仓",
      "抵仓",
      "已入库",
      "已入仓",
      "签收",
      "arriv",
      "warehouse",
    ]);

  return {
    rows,
    events,
    latestTrack,
    trackUpdatedAt,
    sailingTime,
    warehouseArrivedTime,
  };
}

export async function POST(request: Request) {
  try {
    await verifyShipmentTrackOperator();

    const body = (await request.json()) as SaleasyTrackUpdateRequestBody;
    const trackId = getRequiredText(body.trackId, "缺少货件轨迹ID");
    const adminClient = createSupabaseAdminClient();
    const { data: trackData, error: trackError } = await adminClient
      .from("shipment_tracks")
      .select(
        "id, shipment_record_id, warehouse_arrived_time, shipment:shipment_records!inner(id, shipment_no, tracking_no, logistics_provider, overseas_warehouse_arrived_at, status)",
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
    const trackingNo = shipment?.tracking_no?.trim() || "";

    if (providerName !== "赛易") {
      throw new Error("当前货件不是赛易物流商，不能查询赛易轨迹");
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
    const transportPlan = await queryTransportPlan({
      baseUrl,
      token,
      shipmentNo,
      trackingNo,
    });
    const trackResult = await requestSaleasyJson<unknown>({
      baseUrl,
      path: SALEASY_TRANSPORT_PLAN_QUERY_TRACKS_PATH,
      token,
      body: {
        planId: transportPlan.planId,
        warehouseId: transportPlan.warehouseId,
      },
      logScope: LOG_SCOPE,
      label: "query tracks response",
      fallbackError: "赛易轨迹查询失败",
    });
    const parsedTrack = parseTrackResult(trackResult);

    logSaleasyResponse(LOG_SCOPE, "tracks parsed", {
      shipmentNo,
      trackingNo,
      planId: transportPlan.planId,
      warehouseId: transportPlan.warehouseId,
      latestTrack: parsedTrack.latestTrack,
      trackEvents: parsedTrack.events.map((event) => ({
        time: event.time || null,
        content: event.content,
      })),
      sailingTime: parsedTrack.sailingTime,
      warehouseArrivedTime: parsedTrack.warehouseArrivedTime,
      trackUpdatedAt: parsedTrack.trackUpdatedAt,
      eventCount: parsedTrack.events.length,
    });

    if (!parsedTrack.latestTrack) {
      throw new Error("赛易轨迹查询结果为空");
    }

    const updateValues = {
      latest_track: parsedTrack.latestTrack,
      track_events: parsedTrack.events.map((event) => ({
        time: event.time || null,
        content: event.content,
      })),
      sailing_time: parsedTrack.sailingTime,
      warehouse_arrived_time:
        shipment?.overseas_warehouse_arrived_at ||
        parsedTrack.warehouseArrivedTime || track.warehouse_arrived_time,
      track_updated_at: parsedTrack.trackUpdatedAt,
    };
    const { data: updatedData, error: updateError } = await adminClient
      .from("shipment_tracks")
      .update(updateValues)
      .eq("id", trackId)
      .select(
        "id, shipment_record_id, latest_track, track_events, sailing_time, warehouse_arrived_time, track_updated_at, created_at, updated_at, shipment:shipment_records!inner(shipment_no, tracking_no, logistics_provider, product_name, total_qty, order_store, delivery_status)",
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
      trackEvents: parsedTrack.events.map((event) => ({
        time: event.time || null,
        content: event.content,
      })),
      planId: transportPlan.planId,
      warehouseId: transportPlan.warehouseId,
      matchedCount: parsedTrack.events.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "赛易轨迹更新失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
