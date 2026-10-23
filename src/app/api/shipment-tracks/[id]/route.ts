import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  calculateEstimatedWarehouseArrival,
  canEditEstimatedDelivery,
  isValidEstimatedDeliveryDate,
  isValidEstimatedDuration,
} from "@/app/shipment-tracks/_lib/shipment-tracks";
import { syncShipmentWarehouseArrivedAt } from "../_shipment-warehouse-sync";

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

type ShipmentTrackUpdateBody = {
  sailing_time?: unknown;
  warehouse_arrived_time?: unknown;
  estimated_duration_days?: unknown;
  estimated_delivery_time?: unknown;
};

type ShipmentTrackBeforeUpdateRow = {
  shipment_record_id: string;
  warehouse_arrived_time: string | null;
  sailing_time: string | null;
  latest_track: string | null;
  estimated_duration_days: number | null;
};

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

function normalizeDateValue(value: unknown, fieldLabel: string) {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldLabel}格式不正确`);
  }

  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new Error(`${fieldLabel}格式不正确`);
  }

  return value;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await verifyShipmentTrackOperator();

    const { id } = await params;
    const trackId = id?.trim();
    if (!trackId) {
      throw new Error("缺少货件轨迹ID");
    }

    const body = (await request.json()) as ShipmentTrackUpdateBody;
    const updateValues: {
      sailing_time?: string | null;
      warehouse_arrived_time?: string | null;
      estimated_duration_days?: number;
      estimated_delivery_time?: string | null;
    } = {};

    if ("sailing_time" in body) {
      updateValues.sailing_time = normalizeDateValue(
        body.sailing_time,
        "开船时间",
      );
    }

    if ("warehouse_arrived_time" in body) {
      updateValues.warehouse_arrived_time = normalizeDateValue(
        body.warehouse_arrived_time,
        "到仓时间",
      );
    }

    if ("estimated_duration_days" in body) {
      if (!isValidEstimatedDuration(body.estimated_duration_days)) {
        throw new Error("预计时效天数必须为正整数（不超过2147483647）");
      }
      updateValues.estimated_duration_days = body.estimated_duration_days;
    }

    if ("estimated_delivery_time" in body) {
      updateValues.estimated_delivery_time = normalizeDateValue(
        body.estimated_delivery_time, "预计送仓时间",
      );
    }

    if (Object.keys(updateValues).length === 0) {
      throw new Error("没有需要更新的轨迹字段");
    }

    const adminClient = createSupabaseAdminClient();
    const shouldSyncWarehouseArrivedTime =
      "warehouse_arrived_time" in updateValues &&
      Boolean(updateValues.warehouse_arrived_time);
    let previousWarehouseArrivedTime: string | null = null;
    let shipmentRecordId: string | null = null;

    if (shouldSyncWarehouseArrivedTime || "estimated_delivery_time" in updateValues) {
      const { data: existingTrackData, error: existingTrackError } =
        await adminClient
          .from("shipment_tracks")
          .select("shipment_record_id, warehouse_arrived_time, sailing_time, latest_track, estimated_duration_days")
          .eq("id", trackId)
          .single();

      if (existingTrackError) {
        throw existingTrackError;
      }

      const existingTrack = existingTrackData as ShipmentTrackBeforeUpdateRow;
      previousWarehouseArrivedTime = existingTrack.warehouse_arrived_time;
      shipmentRecordId = existingTrack.shipment_record_id;

      if ("estimated_delivery_time" in updateValues) {
        const arrival = calculateEstimatedWarehouseArrival(
          "sailing_time" in updateValues ? updateValues.sailing_time ?? null : existingTrack.sailing_time,
          updateValues.estimated_duration_days ?? existingTrack.estimated_duration_days,
        );
        if (!canEditEstimatedDelivery({
          latest_track: existingTrack.latest_track,
          warehouse_arrived_time: "warehouse_arrived_time" in updateValues
            ? updateValues.warehouse_arrived_time ?? null : existingTrack.warehouse_arrived_time,
          estimated_warehouse_arrived_time: arrival,
        })) {
          throw new Error("仅清关中且已有预计到仓时间的货件可编辑预计送仓时间");
        }
        if (updateValues.estimated_delivery_time &&
          !isValidEstimatedDeliveryDate(arrival, updateValues.estimated_delivery_time)) {
          throw new Error("预计送仓时间须至少晚于预计到仓时间2天");
        }
      }
    }

    const { data, error } = await adminClient
      .from("shipment_tracks")
      .update(updateValues)
      .eq("id", trackId)
      .select(
        "id, shipment_record_id, latest_track, track_events, sailing_time, warehouse_arrived_time, estimated_duration_days, estimated_delivery_time, track_updated_at, created_at, updated_at, shipment:shipment_records!inner(shipment_no, tracking_no, logistics_provider, product_name, total_qty, order_store, delivery_status)",
      )
      .single();

    if (error) {
      throw error;
    }

    if (shouldSyncWarehouseArrivedTime) {
      await syncShipmentWarehouseArrivedAt({
        adminClient,
        shipmentRecordId,
        previousWarehouseArrivedTime,
        nextWarehouseArrivedTime: updateValues.warehouse_arrived_time,
      });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "货件轨迹更新失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
