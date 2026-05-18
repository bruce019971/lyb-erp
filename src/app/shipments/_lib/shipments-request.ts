import type { FilterValue, SortOrder } from "antd/es/table/interface";
import { message } from "antd";

import { supabase } from "@/lib/supabase";

import {
  shipmentDateFields,
  shipmentKeywordFields,
  canEditShipmentDeliveryStatus,
  type ShipmentCreateValues,
  type ShipmentOption,
  type ShipmentRecord,
  type ShipmentUpdateValues,
} from "./shipments";

type ShipmentRequestParams = {
  current?: number;
  pageSize?: number;
  keyword?: string;
} & Record<string, unknown>;

export async function requestShipmentRecords(
  params: ShipmentRequestParams,
  sorter: Record<string, SortOrder>,
  filters: Record<string, FilterValue | null> = {},
) {
  const current = params.current ?? 1;
  const pageSize = params.pageSize ?? 20;
  const from = (current - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("shipment_records")
    .select("*", { count: "exact" })
    .range(from, to);

  shipmentKeywordFields.forEach((field) => {
    const value = params[field];
    if (typeof value === "string" && value.trim()) {
      query = query.ilike(field, `%${value.trim()}%`);
    }
  });

  function normalizeMultiSelectValues(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }

  const orderStoreValues = normalizeMultiSelectValues(params.order_store);
  if (orderStoreValues.length > 0) {
    query = query.in("order_store", orderStoreValues);
  }

  const shipmentNoValues = normalizeMultiSelectValues(params.shipment_no);
  if (shipmentNoValues.length > 0) {
    query = query.in("shipment_no", shipmentNoValues);
  }

  const logisticsProviderValues = normalizeMultiSelectValues(
    params.logistics_provider,
  );
  if (logisticsProviderValues.length > 0) {
    query = query.in("logistics_provider", logisticsProviderValues);
  }

  const productNameValues = normalizeMultiSelectValues(params.product_name);
  if (productNameValues.length > 0) {
    query = query.in("product_name", productNameValues);
  }

  const warehouseArrivedStatus =
    typeof params.warehouse_arrived_status === "string"
      ? params.warehouse_arrived_status.trim()
      : "";
  if (warehouseArrivedStatus === "是") {
    query = query.not("overseas_warehouse_arrived_at", "is", null);
  } else if (warehouseArrivedStatus === "否") {
    query = query.is("overseas_warehouse_arrived_at", null);
  }

  const deliveryStatus =
    typeof params.delivery_status === "string"
      ? params.delivery_status.trim()
      : "";
  if (deliveryStatus === "是" || deliveryStatus === "否") {
    query = query.eq("delivery_status", deliveryStatus);
  }

  function splitFilterText(value?: string) {
    return (value ?? "")
      .trim()
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function getFilterTexts(key: string) {
    const value = filters[key]?.[0];
    return typeof value === "string" ? splitFilterText(value) : [];
  }

  function normalizeFilterValue(value: string) {
    return value.replace(/[(),]/g, " ").trim();
  }

  function buildIlikeOrFilter(fields: string[], values: string[]) {
    return values
      .map(normalizeFilterValue)
      .filter(Boolean)
      .flatMap((value) =>
        fields.map((field) => `${field}.ilike.%${value}%`),
      )
      .join(",");
  }

  function getFilterDateRange(key: string) {
    const value = filters[key]?.[0];
    if (typeof value !== "string") return undefined;
    const [start, end] = value.split("|");
    if (!start && !end) return undefined;
    return { start, end };
  }

  function normalizeDateRangeValue(
    field: string,
    value: unknown,
    boundary: "start" | "end",
  ) {
    if (typeof value !== "string" || !value) return value;
    if (field !== "created_at") return value;
    return boundary === "start"
      ? `${value}T00:00:00`
      : `${value}T23:59:59.999`;
  }

  const shipmentNoFilters = getFilterTexts("shipment_no");
  if (shipmentNoFilters.length > 0) {
    query = query.or(buildIlikeOrFilter(["shipment_no"], shipmentNoFilters));
  }

  shipmentDateFields.forEach((field) => {
    const value = params[field];
    if (Array.isArray(value)) {
      const [start, end] = value;
      const normalizedStart = normalizeDateRangeValue(field, start, "start");
      const normalizedEnd = normalizeDateRangeValue(field, end, "end");
      if (normalizedStart) query = query.gte(field, normalizedStart);
      if (normalizedEnd) query = query.lte(field, normalizedEnd);
    }

    const filterRange = getFilterDateRange(field);
    const normalizedFilterStart = normalizeDateRangeValue(
      field,
      filterRange?.start,
      "start",
    );
    const normalizedFilterEnd = normalizeDateRangeValue(
      field,
      filterRange?.end,
      "end",
    );
    if (normalizedFilterStart) query = query.gte(field, normalizedFilterStart);
    if (normalizedFilterEnd) query = query.lte(field, normalizedFilterEnd);
  });

  const orderFieldKey = Object.keys(sorter ?? {})[0];
  const orderField = orderFieldKey;
  const orderDirection = orderFieldKey ? sorter[orderFieldKey] : undefined;

  if (orderField && orderDirection) {
    query = query.order(orderField, {
      ascending: orderDirection === "ascend",
    });
  } else {
    query = query.order("created_at", {
      ascending: false,
      nullsFirst: false,
    });
  }

  const { data, error, count } = await query;

  if (error) {
    message.error(error.message);
    return {
      data: [],
      success: false,
      total: 0,
    };
  }

  return {
    data: ((data ?? []) as ShipmentRecord[]).map((item) => ({
      ...item,
      delivery_status: item.delivery_status ?? "否",
      is_delivery_completed: item.delivery_status === "是",
    })),
    success: true,
    total: count ?? 0,
  };
}

function normalizeTextValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeNumberValue(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function deriveWarehouseArrivedStatus(
  warehouseArrivedAt?: string | null,
) {
  return warehouseArrivedAt ? "是" : "否";
}

function buildShipmentPayload(values: ShipmentUpdateValues) {
  return {
    order_store: normalizeTextValue(values.order_store),
    logistics_provider: normalizeTextValue(values.logistics_provider),
    shipment_no: normalizeTextValue(values.shipment_no),
    tracking_no: normalizeTextValue(values.tracking_no),
    product_name: normalizeTextValue(values.product_name),
    box_count: normalizeNumberValue(values.box_count),
    pcs_per_box: normalizeNumberValue(values.pcs_per_box),
    overseas_warehouse_arrived_at: normalizeTextValue(
      values.overseas_warehouse_arrived_at,
    ),
    warehouse_arrived_status: deriveWarehouseArrivedStatus(
      values.overseas_warehouse_arrived_at,
    ),
    appointment_time: normalizeTextValue(values.appointment_time),
    goods_value: normalizeNumberValue(values.goods_value),
  };
}

export async function createShipmentRecord(values: ShipmentCreateValues) {
  const response = await fetch("/api/shipments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...buildShipmentPayload(values),
      updated_at: null,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: ShipmentRecord; error?: string }
    | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error || "新增失败");
  }

  return payload.data;
}

export async function updateShipmentRecord(
  id: string,
  values: ShipmentUpdateValues,
) {
  const payload = {
    ...buildShipmentPayload(values),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("shipment_records")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as ShipmentRecord;
}

export async function markShipmentDeliveryStatusAsYes(record: ShipmentRecord) {
  if (!canEditShipmentDeliveryStatus(record)) {
    throw new Error("只有过了约仓时间后才能标记为已送仓");
  }

  const { data, error } = await supabase
    .from("shipment_records")
    .update({
      delivery_status: "是",
      updated_at: new Date().toISOString(),
    })
    .eq("id", record.id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as ShipmentRecord;
}

export async function deleteShipmentRecord(id: string) {
  const response = await fetch(`/api/shipments/${id}`, {
    method: "DELETE",
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error || "删除失败");
  }
}

export async function deleteShipmentRecords(ids: string[]) {
  const response = await fetch("/api/shipments/batch-delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error || "批量删除失败");
  }
}

export async function requestShipmentOptions() {
  const { data, error } = await supabase
    .from("shipment_records")
    .select("id, shipment_no, order_store")
    .order("created_at", { ascending: false, nullsFirst: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as ShipmentOption[]).filter((item) =>
    item.shipment_no?.trim(),
  );
}
