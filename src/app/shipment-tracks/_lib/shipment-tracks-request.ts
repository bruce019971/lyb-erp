import type { SortOrder } from "antd/es/table/interface";

import { supabase } from "@/lib/supabase";

import {
  calculateShipmentTrackDurationDays,
  sanitizeShipmentTrackText,
  type ShipmentTrackEvent,
  type ShipmentTrackRecord,
} from "./shipment-tracks";

type ShipmentTrackRequestParams = {
  current?: number;
  pageSize?: number;
} & Record<string, unknown>;

type ShipmentTrackRow = {
  id: string;
  shipment_record_id: string;
  latest_track: string | null;
  track_events?: unknown;
  sailing_time: string | null;
  warehouse_arrived_time: string | null;
  duration_days?: number | null;
  track_updated_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  shipment:
    | {
        shipment_no: string | null;
        tracking_no: string | null;
        logistics_provider: string | null;
        product_name: string | null;
        total_qty: number | null;
        order_store: string | null;
      }
    | Array<{
        shipment_no: string | null;
        tracking_no: string | null;
        logistics_provider: string | null;
        product_name: string | null;
        total_qty: number | null;
        order_store: string | null;
      }>
    | null;
};

function splitSearchTexts(value: unknown) {
  const values = Array.isArray(value) ? value : [value];

  return values
    .flatMap((item) =>
      typeof item === "string" ? item.split(/[\s,，]+/) : [],
    )
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeMultiSelectValues(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizeTrackEvents(value: unknown): ShipmentTrackEvent[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const content = sanitizeShipmentTrackText(
        typeof record.content === "string" ? record.content : "",
      );
      const time = typeof record.time === "string" ? record.time.trim() : "";

      if (!content) return null;

      return {
        content,
        time: time || null,
      };
    })
    .filter((item): item is ShipmentTrackEvent => Boolean(item));
}

function normalizeTrackRow(row: ShipmentTrackRow): ShipmentTrackRecord {
  const shipment = Array.isArray(row.shipment) ? row.shipment[0] : row.shipment;
  const trackEvents = normalizeTrackEvents(row.track_events);
  const latestTrack =
    sanitizeShipmentTrackText(row.latest_track) || trackEvents[0]?.content || null;

  return {
    id: row.id,
    shipment_record_id: row.shipment_record_id,
    shipment_no: shipment?.shipment_no ?? null,
    tracking_no: shipment?.tracking_no ?? null,
    logistics_provider: shipment?.logistics_provider ?? null,
    product_name: shipment?.product_name ?? null,
    total_qty: shipment?.total_qty ?? null,
    order_store: shipment?.order_store ?? null,
    latest_track: latestTrack,
    track_events: trackEvents,
    sailing_time: row.sailing_time,
    warehouse_arrived_time: row.warehouse_arrived_time,
    duration_days:
      row.duration_days ??
      calculateShipmentTrackDurationDays(
        row.sailing_time,
        row.warehouse_arrived_time,
      ),
    track_updated_at: row.track_updated_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function requestShipmentTrackRecords(
  params: ShipmentTrackRequestParams,
  sorter: Record<string, SortOrder> = {},
) {
  const shipmentNoValues = splitSearchTexts(params.shipment_no);
  const trackingNoValues = splitSearchTexts(params.tracking_no);
  const orderStoreValues = normalizeMultiSelectValues(params.order_store);
  const productNameValues = normalizeMultiSelectValues(params.product_name);
  const logisticsProviderValues = normalizeMultiSelectValues(
    params.logistics_provider,
  );
  const warehouseArrived = typeof params.warehouse_arrived === "string"
    ? params.warehouse_arrived.trim()
    : "";
  const shouldFilterShipments =
    shipmentNoValues.length > 0 ||
    trackingNoValues.length > 0 ||
    orderStoreValues.length > 0 ||
    productNameValues.length > 0 ||
    logisticsProviderValues.length > 0 ||
    Boolean(warehouseArrived);
  let matchedShipmentIds: string[] | null = null;

  if (shouldFilterShipments) {
    let shipmentQuery = supabase
      .from("shipment_records")
      .select("id")
      .eq("status", "有效");

    if (shipmentNoValues.length > 0) {
      shipmentQuery = shipmentQuery.in("shipment_no", shipmentNoValues);
    }

    if (trackingNoValues.length > 0) {
      shipmentQuery = shipmentQuery.in("tracking_no", trackingNoValues);
    }

    if (orderStoreValues.length > 0) {
      shipmentQuery = shipmentQuery.in("order_store", orderStoreValues);
    }

    if (productNameValues.length > 0) {
      shipmentQuery = shipmentQuery.in("product_name", productNameValues);
    }

    if (logisticsProviderValues.length > 0) {
      shipmentQuery = shipmentQuery.in(
        "logistics_provider",
        logisticsProviderValues,
      );
    }

    const { data: shipmentRows, error: shipmentError } = await shipmentQuery;

    if (shipmentError) {
      return { data: [], success: false, total: 0 };
    }

    matchedShipmentIds = (shipmentRows ?? [])
      .map((item) => item.id)
      .filter((item): item is string => Boolean(item));

    if (matchedShipmentIds.length === 0) {
      return { data: [], success: true, total: 0 };
    }
  }

  let query = supabase
    .from("shipment_tracks")
    .select(
      "id, shipment_record_id, latest_track, track_events, sailing_time, warehouse_arrived_time, track_updated_at, created_at, updated_at, shipment:shipment_records!inner(shipment_no, tracking_no, logistics_provider, product_name, total_qty, order_store)",
      { count: "exact" },
    )
    .eq("shipment.status", "有效");

  if (matchedShipmentIds && matchedShipmentIds.length > 0) {
    query = query.in("shipment_record_id", matchedShipmentIds);
  }

  if (warehouseArrived === "是") {
    query = query.not("warehouse_arrived_time", "is", null);
  } else if (warehouseArrived === "否") {
    query = query.is("warehouse_arrived_time", null);
  }

  const orderField = Object.keys(sorter ?? {})[0];
  const orderDirection = orderField ? sorter[orderField] : undefined;
  if (orderField && orderDirection) {
    query = query.order(orderField, {
      ascending: orderDirection === "ascend",
      nullsFirst: false,
    });
  } else {
    query = query.order("created_at", {
      ascending: false,
      nullsFirst: false,
    });
  }

  const { data, error, count } = await query;

  if (error) {
    return { data: [], success: false, total: 0 };
  }

  return {
    data: ((data ?? []) as ShipmentTrackRow[]).map(normalizeTrackRow),
    success: true,
    total: count ?? 0,
  };
}

export async function updateSaleasyShipmentTrack(values: { trackId: string }) {
  const response = await fetch("/api/shipment-tracks/saleasy-update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        data?: ShipmentTrackRow;
        trackEvents?: ShipmentTrackEvent[];
        matchedCount?: number;
        error?: string;
      }
    | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error || "赛易轨迹更新失败");
  }

  return {
    record: normalizeTrackRow(payload.data),
    trackEvents: payload.trackEvents ?? [],
    matchedCount: payload.matchedCount ?? 0,
  };
}

export async function updateRishenghuiShipmentTrack(values: {
  trackId: string;
  accessToken: string;
}) {
  const response = await fetch("/api/shipment-tracks/rishenghui-update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        data?: ShipmentTrackRow;
        trackEvents?: ShipmentTrackEvent[];
        matchedCount?: number;
        error?: string;
      }
    | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error || "日升辉轨迹更新失败");
  }

  return {
    record: normalizeTrackRow(payload.data),
    trackEvents: payload.trackEvents ?? [],
    matchedCount: payload.matchedCount ?? 0,
  };
}

export async function updateTongtuShipmentTrack(values: { trackId: string }) {
  const response = await fetch("/api/shipment-tracks/tongtu-update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        data?: ShipmentTrackRow;
        trackEvents?: ShipmentTrackEvent[];
        matchedCount?: number;
        error?: string;
      }
    | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error || "通途轨迹更新失败");
  }

  return {
    record: normalizeTrackRow(payload.data),
    trackEvents: payload.trackEvents ?? [],
    matchedCount: payload.matchedCount ?? 0,
  };
}

const TANGCHAO_AUTH_KEY_STORAGE_KEY = "tangchao_auth_key";

function getStoredTangchaoAuthKey() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TANGCHAO_AUTH_KEY_STORAGE_KEY)?.trim() || "";
}

function saveStoredTangchaoAuthKey(authKey: string) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(TANGCHAO_AUTH_KEY_STORAGE_KEY, authKey);
}

function clearStoredTangchaoAuthKey() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(TANGCHAO_AUTH_KEY_STORAGE_KEY);
}

export async function loginTangchaoShipmentTrack() {
  const response = await fetch("/api/shipment-tracks/tangchao-auth", {
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        authKey?: string;
        error?: string;
      }
    | null;

  if (!response.ok || !payload?.authKey?.trim()) {
    throw new Error(payload?.error || "唐朝登录失败");
  }

  const authKey = payload.authKey.trim();
  saveStoredTangchaoAuthKey(authKey);

  return authKey;
}

export async function getRequiredTangchaoAuthKey() {
  const storedAuthKey = getStoredTangchaoAuthKey();
  if (storedAuthKey) return storedAuthKey;

  return loginTangchaoShipmentTrack();
}

function isTangchaoAuthError(message: string) {
  return /auth.?key|登录|认证|过期|失效|无效|未授权|权限|401|403/i.test(message);
}

async function requestTangchaoShipmentTrackUpdate(values: {
  trackId: string;
  authKey: string;
}) {
  const response = await fetch("/api/shipment-tracks/tangchao-update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        data?: ShipmentTrackRow;
        trackEvents?: ShipmentTrackEvent[];
        matchedCount?: number;
        error?: string;
      }
    | null;

  if (!response.ok || !payload?.data) {
    const message = payload?.error || "唐朝轨迹更新失败";
    throw new Error(message);
  }

  return {
    record: normalizeTrackRow(payload.data),
    trackEvents: payload.trackEvents ?? [],
    matchedCount: payload.matchedCount ?? 0,
  };
}

export async function updateTangchaoShipmentTrack(values: {
  trackId: string;
  authKey: string;
}) {
  try {
    return await requestTangchaoShipmentTrackUpdate(values);
  } catch (error) {
    const message = error instanceof Error ? error.message : "唐朝轨迹更新失败";
    if (!isTangchaoAuthError(message)) {
      throw error;
    }

    clearStoredTangchaoAuthKey();
    const authKey = await loginTangchaoShipmentTrack();

    return requestTangchaoShipmentTrackUpdate({
      trackId: values.trackId,
      authKey,
    });
  }
}

export async function updateShipmentTrackRecord(
  id: string,
  values: {
    sailing_time?: string | null;
    warehouse_arrived_time?: string | null;
  },
) {
  const response = await fetch(`/api/shipment-tracks/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        data?: ShipmentTrackRow;
        error?: string;
      }
    | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error || "货件轨迹更新失败");
  }

  return normalizeTrackRow(payload.data);
}
