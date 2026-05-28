import type { SortOrder } from "antd/es/table/interface";

import { supabase } from "@/lib/supabase";

import {
  calculateShipmentTrackDurationDays,
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
      }
    | Array<{
        shipment_no: string | null;
        tracking_no: string | null;
        logistics_provider: string | null;
        product_name: string | null;
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
      const content =
        typeof record.content === "string" ? record.content.trim() : "";
      const time = typeof record.time === "string" ? record.time.trim() : "";

      if (!content && !time) return null;

      return {
        content: content || "-",
        time: time || null,
      };
    })
    .filter((item): item is ShipmentTrackEvent => Boolean(item));
}

function normalizeTrackRow(row: ShipmentTrackRow): ShipmentTrackRecord {
  const shipment = Array.isArray(row.shipment) ? row.shipment[0] : row.shipment;

  return {
    id: row.id,
    shipment_record_id: row.shipment_record_id,
    shipment_no: shipment?.shipment_no ?? null,
    tracking_no: shipment?.tracking_no ?? null,
    logistics_provider: shipment?.logistics_provider ?? null,
    product_name: shipment?.product_name ?? null,
    latest_track: row.latest_track,
    track_events: normalizeTrackEvents(row.track_events),
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
  const current = params.current ?? 1;
  const pageSize = params.pageSize ?? 40;
  const from = (current - 1) * pageSize;
  const to = from + pageSize - 1;
  const shipmentNoValues = splitSearchTexts(params.shipment_no);
  const trackingNoValues = splitSearchTexts(params.tracking_no);
  const productNameValues = normalizeMultiSelectValues(params.product_name);
  const shouldFilterShipments =
    shipmentNoValues.length > 0 ||
    trackingNoValues.length > 0 ||
    productNameValues.length > 0;
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

    if (productNameValues.length > 0) {
      shipmentQuery = shipmentQuery.in("product_name", productNameValues);
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
      "id, shipment_record_id, latest_track, track_events, sailing_time, warehouse_arrived_time, track_updated_at, created_at, updated_at, shipment:shipment_records!inner(shipment_no, tracking_no, logistics_provider, product_name)",
      { count: "exact" },
    )
    .eq("shipment.status", "有效")
    .range(from, to);

  if (matchedShipmentIds && matchedShipmentIds.length > 0) {
    query = query.in("shipment_record_id", matchedShipmentIds);
  }

  const orderField = Object.keys(sorter ?? {})[0];
  const orderDirection = orderField ? sorter[orderField] : undefined;
  if (orderField && orderDirection) {
    query = query.order(orderField, {
      ascending: orderDirection === "ascend",
      nullsFirst: false,
    });
  } else {
    query = query.order("track_updated_at", {
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
