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

type TangchaoTrackUpdateRequestBody = {
  trackId?: string;
  authKey?: string;
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
      }
    | Array<{
        id: string;
        shipment_no: string | null;
        tracking_no: string | null;
        logistics_provider: string | null;
      }>
    | null;
};

type TangchaoTrajectoryRow = {
  is_china_abroad_halfway?: unknown;
  waybill_no?: unknown;
  upToDateTime?: unknown;
  status?: unknown;
  transport_type_name?: unknown;
  trajectoryList?: unknown;
};

type TangchaoTrackEvent = {
  index: number;
  content: string;
  status: string;
  trajectoryStatus: number | null;
  time: string;
  row: Record<string, unknown>;
};

const LOG_SCOPE = "tangchao-track-update";
const DEFAULT_TANGCHAO_BASE_URL = "https://wl.tclogx.com";
const TANGCHAO_PROVIDER_NAME = "唐朝";
const TANGCHAO_TRACKING_PATH = "/client/v3/trajectory/LogisticsTracking/index";
const TANGCHAO_SAILING_STATUS = 20;
const TANGCHAO_WAREHOUSE_ARRIVED_STATUS = 9;

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

function getPayloadSummary(payload: unknown) {
  const text = JSON.stringify(payload);
  return text.length > 1000 ? `${text.slice(0, 1000)}...` : text;
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

function parseDateTimeText(value: unknown) {
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

function getTrajectoryRows(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is TangchaoTrajectoryRow =>
        Boolean(item) && typeof item === "object",
    );
  }

  const record = toRecord(payload);
  if (!record) return [];

  for (const key of ["data", "result", "rows", "list", "records"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is TangchaoTrajectoryRow =>
          Boolean(item) && typeof item === "object",
      );
    }
  }

  return [];
}

function normalizeTrackEvent(row: unknown, index: number): TangchaoTrackEvent {
  const record = toRecord(row) ?? {};
  const status = getOptionalText(record.status_name);
  const message = getOptionalText(record.msg);
  const name = getOptionalText(record.name);
  const contentParts = [status, message].filter(Boolean);
  const trajectoryStatus =
    typeof record.trajectory_status === "number" &&
    Number.isFinite(record.trajectory_status)
      ? record.trajectory_status
      : typeof record.trajectory_status === "string"
        ? Number(record.trajectory_status)
        : null;

  if (name && !contentParts.some((item) => item.includes(name))) {
    contentParts.push(name);
  }

  return {
    index,
    content: contentParts.join("；"),
    status,
    trajectoryStatus:
      trajectoryStatus !== null && Number.isFinite(trajectoryStatus)
        ? trajectoryStatus
        : null,
    time: parseDateTimeText(record.time),
    row: record,
  };
}

function getEventTimestamp(event: { time: string; index: number }) {
  const timestamp = Date.parse(event.time);
  return Number.isNaN(timestamp) ? event.index : timestamp;
}

function dateOnly(value: string) {
  return value ? value.slice(0, 10) : null;
}

function findEventDateByStatus(
  events: TangchaoTrackEvent[],
  trajectoryStatus: number,
) {
  const event = events.find(
    (item) => item.trajectoryStatus === trajectoryStatus && item.time,
  );

  return event?.time ? dateOnly(event.time) : null;
}

function parseTangchaoTrackResult(payload: unknown, trackingNo: string) {
  const trajectoryRows = getTrajectoryRows(payload);
  const matchedRow =
    trajectoryRows.find(
      (row) =>
        getOptionalText(row.waybill_no).toLowerCase() ===
        trackingNo.toLowerCase(),
    ) ?? trajectoryRows[0];
  const trajectoryList = Array.isArray(matchedRow?.trajectoryList)
    ? matchedRow.trajectoryList
    : [];
  const events = trajectoryList
    .map(normalizeTrackEvent)
    .filter((event) => event.content || event.time)
    .sort((left, right) => getEventTimestamp(right) - getEventTimestamp(left));
  const latestEvent = events[0];

  return {
    matchedRow,
    events,
    latestTrack: latestEvent?.content || getOptionalText(matchedRow?.status),
    trackUpdatedAt:
      parseDateTimeText(matchedRow?.upToDateTime) ||
      latestEvent?.time ||
      new Date().toISOString(),
    sailingTime: findEventDateByStatus(events, TANGCHAO_SAILING_STATUS),
    warehouseArrivedTime: findEventDateByStatus(
      events,
      TANGCHAO_WAREHOUSE_ARRIVED_STATUS,
    ),
  };
}

async function queryTangchaoTrack(params: {
  baseUrl: string;
  authKey: string;
  trackingNo: string;
}) {
  const response = await fetch(
    joinTangchaoUrl(params.baseUrl, TANGCHAO_TRACKING_PATH),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authkey: params.authKey,
      },
      body: JSON.stringify({
        waybill_no: [params.trackingNo],
      }),
    },
  );
  const payload = await response.json().catch(() => null);

  logTangchaoResponse("tracking response", {
    status: response.status,
    statusText: response.statusText,
    payload,
  });

  if (!response.ok) {
    throw new Error(getPayloadError(payload) || "唐朝轨迹查询失败");
  }

  return payload;
}

export async function POST(request: Request) {
  try {
    await verifyShipmentTrackOperator();

    const body = (await request.json()) as TangchaoTrackUpdateRequestBody;
    const trackId = getRequiredText(body.trackId, "缺少货件轨迹ID");
    const authKey = getRequiredText(body.authKey, "缺少唐朝authKey，请重新登录唐朝");
    const adminClient = createSupabaseAdminClient();
    const { data: trackData, error: trackError } = await adminClient
      .from("shipment_tracks")
      .select(
        "id, shipment_record_id, warehouse_arrived_time, shipment:shipment_records!inner(id, shipment_no, tracking_no, logistics_provider, status)",
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

    if (providerName !== TANGCHAO_PROVIDER_NAME) {
      throw new Error("当前货件不是唐朝物流商，不能查询唐朝轨迹");
    }

    const trackResult = await queryTangchaoTrack({
      baseUrl: DEFAULT_TANGCHAO_BASE_URL,
      authKey,
      trackingNo,
    });
    const parsedTrack = parseTangchaoTrackResult(trackResult, trackingNo);

    logTangchaoResponse("tracks parsed", {
      trackingNo,
      latestTrack: parsedTrack.latestTrack,
      sailingTime: parsedTrack.sailingTime,
      warehouseArrivedTime: parsedTrack.warehouseArrivedTime,
      trackUpdatedAt: parsedTrack.trackUpdatedAt,
      eventCount: parsedTrack.events.length,
    });

    if (!parsedTrack.latestTrack) {
      throw new Error(
        `唐朝轨迹查询结果为空：${getPayloadSummary(trackResult)}`,
      );
    }

    const updateValues = {
      latest_track: parsedTrack.latestTrack,
      track_events: parsedTrack.events.map((event) => ({
        time: event.time || null,
        content: event.content,
      })),
      sailing_time: parsedTrack.sailingTime,
      warehouse_arrived_time:
        parsedTrack.warehouseArrivedTime || track.warehouse_arrived_time,
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
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "唐朝轨迹更新失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
