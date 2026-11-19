import type { SortOrder } from "antd/es/table/interface";

import { supabase } from "@/lib/supabase";
import { getPageRange } from "@/lib/table-pagination";

import {
  calculateShipmentTrackDurationDays,
  calculateEstimatedWarehouseArrival,
  DEFAULT_ESTIMATED_DURATION_DAYS,
  sanitizeShipmentTrackText,
  type ShipmentTrackEvent,
  type ShipmentTrackRecord,
} from "./shipment-tracks";

type ShipmentTrackRequestParams = {
  current?: number;
  pageSize?: number;
} & Record<string, unknown>;

export type ShipmentTrackFilterOptions = {
  order_stores: string[];
  product_names: string[];
  logistics_providers: string[];
};

export async function requestShipmentTrackFilterOptions(): Promise<ShipmentTrackFilterOptions> {
  const { data, error } = await supabase.from("shipment_track_filter_options")
    .select("order_stores, product_names, logistics_providers").single();
  if (error) throw error;
  return data as ShipmentTrackFilterOptions;
}

export type ShipmentTrackSummary = {
  totalQty: number;
  total: number;
};

type ShipmentTrackFilterState = {
  shipmentFilters: Record<string, string[]>;
  showOverdueShipments: boolean;
  showDeliveredShipments: boolean;
  warehouseArrived: string;
  latestTrack: string;
};

interface ShipmentTrackSearchQuery {
  eq(field: string, value: string): this;
  gt(field: string, value: number): this;
  in(field: string, values: string[]): this;
  not(field: string, operator: string, value: unknown): this;
  is(field: string, value: unknown): this;
  or(filters: string, options?: { referencedTable?: string }): this;
}

type ShipmentTrackRow = {
  id: string;
  shipment_record_id: string;
  latest_track: string | null;
  track_events?: unknown;
  sailing_time: string | null;
  warehouse_arrived_time: string | null;
  estimated_duration_days: number | null;
  estimated_delivery_time: string | null;
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
        delivery_status: string | null;
      }
    | Array<{
        shipment_no: string | null;
        tracking_no: string | null;
        logistics_provider: string | null;
        product_name: string | null;
        total_qty: number | null;
        order_store: string | null;
        delivery_status: string | null;
      }>
    | null;
};

type ShipmentTrackSummaryRow = {
  sailing_time: string | null;
  warehouse_arrived_time: string | null;
  shipment:
    | {
        total_qty: number | null;
      }
    | Array<{
        total_qty: number | null;
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

function toFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
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
    delivery_status: shipment?.delivery_status ?? "否",
    latest_track: latestTrack,
    track_events: trackEvents,
    sailing_time: row.sailing_time,
    warehouse_arrived_time: row.warehouse_arrived_time,
    estimated_duration_days: row.estimated_duration_days ?? DEFAULT_ESTIMATED_DURATION_DAYS,
    estimated_delivery_time: row.estimated_delivery_time ?? null,
    estimated_warehouse_arrived_time: calculateEstimatedWarehouseArrival(
      row.sailing_time, row.estimated_duration_days ?? DEFAULT_ESTIMATED_DURATION_DAYS,
    ),
    duration_days: calculateShipmentTrackDurationDays(
      row.sailing_time,
      row.warehouse_arrived_time,
    ),
    track_updated_at: row.track_updated_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function resolveShipmentTrackFilterState(
  params: ShipmentTrackRequestParams,
): Promise<
  { success: true; state: ShipmentTrackFilterState } | { success: false }
> {
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
  const showDeliveredShipments = params.show_delivered_shipments === true;
  const showOverdueShipments = params.show_overdue_shipments === true;
  const latestTrack = typeof params.latest_track === "string"
    ? params.latest_track.trim()
    : "";
  const shipmentFilters = {
    shipment_no: shipmentNoValues,
    tracking_no: trackingNoValues,
    order_store: orderStoreValues,
    product_name: productNameValues,
    logistics_provider: logisticsProviderValues,
  };

  return {
    success: true,
    state: {
      shipmentFilters,
      showOverdueShipments,
      showDeliveredShipments,
      warehouseArrived,
      latestTrack,
    },
  };
}

function applyShipmentTrackFilterState<TQuery extends ShipmentTrackSearchQuery>(
  query: TQuery,
  state: ShipmentTrackFilterState,
) {
  let nextQuery = query;

  if (state.latestTrack) {
    nextQuery = nextQuery.eq("latest_track", state.latestTrack);
  }

  if (state.showOverdueShipments) {
    nextQuery = nextQuery.gt("duration_days", 50);
  }

  if (!state.showDeliveredShipments) {
    nextQuery = nextQuery.or("delivery_status.is.null,delivery_status.neq.是", {
      referencedTable: "shipment",
    });
  }

  for (const [field, values] of Object.entries(state.shipmentFilters)) {
    if (values.length) nextQuery = nextQuery.in(`shipment.${field}`, values);
  }

  if (state.warehouseArrived === "是") {
    nextQuery = nextQuery.not("warehouse_arrived_time", "is", null);
  } else if (state.warehouseArrived === "否") {
    nextQuery = nextQuery.is("warehouse_arrived_time", null);
  }

  return nextQuery as TQuery;
}

function getEmptyShipmentTrackSummary(): ShipmentTrackSummary {
  return {
    totalQty: 0,
    total: 0,
  };
}

export async function requestShipmentTrackRecords(
  params: ShipmentTrackRequestParams,
  sorter: Record<string, SortOrder> = {},
) {
  const filterResult = await resolveShipmentTrackFilterState(params);

  if (!filterResult.success) {
    return { data: [], success: false, total: 0 };
  }

  let query = supabase
    .from("shipment_tracks")
    .select(
      "id, shipment_record_id, latest_track, track_events, sailing_time, warehouse_arrived_time, estimated_duration_days, estimated_delivery_time, track_updated_at, created_at, updated_at, shipment:shipment_records!inner(shipment_no, tracking_no, logistics_provider, product_name, total_qty, order_store, delivery_status)",
      { count: "exact" },
    )
    .eq("shipment.status", "有效");

  query = applyShipmentTrackFilterState(query, filterResult.state);

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

  if (orderField !== "id") {
    query = query.order("id", { ascending: true });
  }

  const { from, to } = getPageRange(params);
  const { data, error, count } = await query.range(from, to);
  // PostgREST reports an out-of-range offset as 416. Recover the current count
  // so the table can move to the last page after deletions.
  if (error?.code === "PGRST103") {
    const first = await query.range(0, 0);
    if (first.error) throw first.error;
    return { data: [], success: true, total: first.count ?? 0 };
  }

  if (error) throw error;
  return {
    data: ((data ?? []) as ShipmentTrackRow[]).map(normalizeTrackRow),
    success: true,
    total: count ?? 0,
  };
}

export async function requestShipmentTrackSummary(
  params: ShipmentTrackRequestParams,
): Promise<ShipmentTrackSummary> {
  const filterResult = await resolveShipmentTrackFilterState(params);

  if (!filterResult.success) throw new Error("货件筛选失败");

  const pageSize = 1000;
  let page = 0;
  let summary = getEmptyShipmentTrackSummary();

  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    let query = supabase
      .from("shipment_tracks")
      .select(
        "sailing_time, warehouse_arrived_time, shipment:shipment_records!inner(total_qty)",
      )
      .eq("shipment.status", "有效")
      .order("id", { ascending: true })
      .range(from, to);

    query = applyShipmentTrackFilterState(query, filterResult.state);

    const { data, error } = await query;

    if (error) throw error;

    const rows = (data ?? []) as ShipmentTrackSummaryRow[];
    rows.forEach((row) => {
      const shipment = Array.isArray(row.shipment)
        ? row.shipment[0]
        : row.shipment;

      summary = {
        totalQty: summary.totalQty + toFiniteNumber(shipment?.total_qty),
        total: summary.total + 1,
      };
    });

    if (rows.length < pageSize) {
      return {
        ...summary,
        totalQty: Number(summary.totalQty.toFixed(2)),
      };
    }

    page += 1;
  }
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
    estimated_duration_days?: number;
    estimated_delivery_time?: string | null;
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
