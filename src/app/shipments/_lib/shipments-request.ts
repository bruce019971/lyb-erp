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
    .eq("status", "有效")
    .range(from, to);

  shipmentKeywordFields.forEach((field) => {
    if (field === "shipment_no" || field === "tracking_no") return;

    const value = params[field];
    if (typeof value === "string" && value.trim()) {
      query = query.ilike(field, `%${value.trim()}%`);
    }
  });

  function normalizeMultiSelectValues(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }

  function splitSearchTexts(value: unknown): string[] {
    const values = Array.isArray(value) ? value : [value];

    return values
      .flatMap((item) =>
        typeof item === "string" ? item.split(/[\s,，]+/) : [],
      )
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const orderStoreValues = normalizeMultiSelectValues(params.order_store);
  if (orderStoreValues.length > 0) {
    query = query.in("order_store", orderStoreValues);
  }

  const shipmentNoValues = splitSearchTexts(params.shipment_no);
  if (shipmentNoValues.length > 0) {
    query = query.in("shipment_no", shipmentNoValues);
  }

  const trackingNoValues = splitSearchTexts(params.tracking_no);
  if (trackingNoValues.length > 0) {
    query = query.in("tracking_no", trackingNoValues);
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

  const isRelabel =
    typeof params.is_relabel === "string" ? params.is_relabel.trim() : "";
  if (isRelabel === "是") {
    query = query.eq("is_relabel", isRelabel);
  } else if (isRelabel === "否") {
    query = query.or("is_relabel.is.null,is_relabel.eq.否");
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

  const shipmentRecords = (data ?? []) as ShipmentRecord[];
  const relabelShipmentNos = Array.from(
    new Set(
      shipmentRecords
        .filter((item) => item.is_relabel === "是")
        .map((item) => item.shipment_no?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  );
  const relabelDeliveryTimeMap = new Map<string, string[]>();

  if (relabelShipmentNos.length > 0) {
    const { data: relabelRecords, error: relabelError } = await supabase
      .from("relabel_records")
      .select("original_shipment_no, delivery_time")
      .in("original_shipment_no", relabelShipmentNos)
      .not("delivery_time", "is", null)
      .order("delivery_time", { ascending: true, nullsFirst: false });

    if (relabelError) {
      message.error(relabelError.message);
    } else {
      (relabelRecords ?? []).forEach((item) => {
        const shipmentNo =
          typeof item.original_shipment_no === "string"
            ? item.original_shipment_no.trim()
            : "";
        const deliveryTime =
          typeof item.delivery_time === "string" ? item.delivery_time : "";
        if (!shipmentNo || !deliveryTime) return;

        const current = relabelDeliveryTimeMap.get(shipmentNo) ?? [];
        if (!current.includes(deliveryTime)) {
          relabelDeliveryTimeMap.set(shipmentNo, [...current, deliveryTime]);
        }
      });
    }
  }

  return {
    data: shipmentRecords.map((item) => ({
      ...item,
      delivery_status: item.delivery_status ?? "否",
      relabel_delivery_times:
        item.is_relabel === "是" && item.shipment_no?.trim()
          ? (relabelDeliveryTimeMap.get(item.shipment_no.trim()) ?? [])
          : [],
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

function compactPayload<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function buildShipmentPayload(values: ShipmentUpdateValues) {
  const payload: Partial<ShipmentUpdateValues> = compactPayload({
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
    appointment_time:
      values.appointment_time === undefined
        ? undefined
        : normalizeTextValue(values.appointment_time),
    is_relabel: normalizeTextValue(values.is_relabel),
    goods_value: normalizeNumberValue(values.goods_value),
    remark: normalizeTextValue(values.remark),
  });

  if ("carton_label_url" in values) {
    payload.carton_label_url = normalizeTextValue(values.carton_label_url);
  }

  if ("logistics_box_mark_url" in values) {
    payload.logistics_box_mark_url = normalizeTextValue(
      values.logistics_box_mark_url,
    );
  }

  return payload;
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

export async function updateShipmentDeliveryStatus(
  record: ShipmentRecord,
  value: string,
) {
  if (value === "是" && !canEditShipmentDeliveryStatus(record)) {
    throw new Error("只有过了送仓时间后才能标记为已送仓");
  }

  const normalizedValue = normalizeTextValue(value) ?? "否";

  if ((record.delivery_status ?? "否") === normalizedValue) {
    return record;
  }

  const { data, error } = await supabase
    .from("shipment_records")
    .update({
      delivery_status: normalizedValue,
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

export async function updateShipmentRelabelStatus(
  record: ShipmentRecord,
  value?: string | null,
) {
  const normalizedValue = normalizeTextValue(value);

  if ((record.is_relabel ?? null) === normalizedValue) {
    return record;
  }

  const { data, error } = await supabase
    .from("shipment_records")
    .update({
      is_relabel: normalizedValue,
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

export type ShipmentFileUrlField =
  | "carton_label_url"
  | "logistics_box_mark_url";

export async function clearShipmentFileUrls(
  ids: string[],
  field: ShipmentFileUrlField,
) {
  const response = await fetch("/api/shipments/batch-clear-files", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids, field }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: { count?: number }; error?: string }
    | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error || "货件文件清理失败");
  }

  return payload.data;
}

export type ShipmentBatchGoodsValueResponse = {
  total: number;
  successCount: number;
  failureCount: number;
  failures: Array<{
    shipmentNo: string;
    error: string;
  }>;
};

export async function batchCalculateShipmentGoodsValue(ids: string[]) {
  const response = await fetch("/api/shipments/batch-goods-value", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: ShipmentBatchGoodsValueResponse; error?: string }
    | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error || "货物价值批量计算失败");
  }

  return payload.data;
}

export type ShipmentBatchCartonLabelResult = {
  shipmentNo: string;
  success: boolean;
  url?: string;
  error?: string;
};

export type ShipmentBatchCartonLabelResponse = {
  total: number;
  successCount: number;
  failureCount: number;
  results: ShipmentBatchCartonLabelResult[];
};

export async function batchGenerateShipmentCartonLabels(
  shipmentNos: string[],
) {
  const response = await fetch("/api/shipments/batch-carton-labels", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ shipmentNos }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: ShipmentBatchCartonLabelResponse; error?: string }
    | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error || "外箱标签批量处理失败");
  }

  return payload.data;
}

export async function generateShipmentLogisticsBoxMark(values: {
  shipmentId: string;
  accessToken: string;
}) {
  const response = await fetch("/api/shipments/logistics-box-mark", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: ShipmentRecord; fileurl?: string; error?: string }
    | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error || "物流箱唛生成失败");
  }

  return payload.data;
}

export async function generateShipmentRishenghuiOrderInvoice(values: {
  shipmentId: string;
  shipmentNo?: string | null;
}) {
  const response = await fetch("/api/shipments/rishenghui-order-invoice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        data?: ShipmentRecord;
        fileUrl?: string;
        fileName?: string;
        error?: string;
      }
    | null;

  if (!response.ok || !payload?.fileUrl || !payload.fileName) {
    throw new Error(payload?.error || "日升辉下单发票生成失败");
  }

  return {
    record: payload.data,
    fileUrl: payload.fileUrl,
    fileName: payload.fileName,
  };
}

export async function generateShipmentTongtuOrderInvoice(values: {
  shipmentId: string;
  shipmentNo?: string | null;
}) {
  const response = await fetch("/api/shipments/tongtu-order-invoice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        data?: ShipmentRecord;
        fileUrl?: string;
        fileName?: string;
        error?: string;
      }
    | null;

  if (!response.ok || !payload?.fileUrl || !payload.fileName) {
    throw new Error(payload?.error || "通途下单发票生成失败");
  }

  return {
    record: payload.data,
    fileUrl: payload.fileUrl,
    fileName: payload.fileName,
  };
}

export async function getRishenghuiAccessToken(values: {
  code: string;
  uuid: string;
}) {
  const response = await fetch("/api/logistics/rishenghui/access-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        accessToken?: string;
        error?: string;
      }
    | null;

  if (!response.ok || !payload?.accessToken) {
    throw new Error(payload?.error || "日升辉登录失败");
  }

  return payload.accessToken;
}

export async function submitRishenghuiOrderInvoice(values: {
  shipmentId: string;
  fileUrl: string;
  fileName: string;
  accessToken: string;
}) {
  const response = await fetch("/api/shipments/rishenghui-order-submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        data?: ShipmentRecord;
        packno?: string;
        error?: string;
      }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error || "日升辉发票上传失败");
  }

  return {
    record: payload?.data,
    packno: payload?.packno?.trim() || "",
  };
}

export async function submitTongtuOrderInvoice(values: { shipmentId: string }) {
  const response = await fetch("/api/shipments/tongtu-order-submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        data?: ShipmentRecord;
        trackingNo?: string;
        waybillId?: string;
        taskId?: string;
        error?: string;
      }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error || "通途导入运单失败");
  }

  return {
    record: payload?.data,
    packno: payload?.trackingNo?.trim() || "",
    waybillId: payload?.waybillId?.trim() || "",
    taskId: payload?.taskId?.trim() || "",
  };
}

export async function generateShipmentTongtuLogisticsBoxMark(values: {
  shipmentId: string;
}) {
  const response = await fetch("/api/shipments/tongtu-logistics-box-mark", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        data?: ShipmentRecord;
        fileurl?: string;
        trackingNo?: string;
        waybillId?: string;
        error?: string;
      }
    | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error || "通途物流箱唛生成失败");
  }

  return {
    record: payload.data,
    fileurl: payload.fileurl?.trim() || "",
    trackingNo: payload.trackingNo?.trim() || "",
    waybillId: payload.waybillId?.trim() || "",
  };
}

function getShipmentAssetPath(prefix: string, file: File) {
  const extension = file.name.includes(".")
    ? file.name.split(".").pop()?.toLowerCase()
    : undefined;
  const suffix = extension ? `.${extension}` : "";
  const randomId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}/${randomId}${suffix}`;
}

export async function uploadShipmentLogisticsBoxMark(file: File) {
  const filePath = getShipmentAssetPath("shipment-logistics-box-marks", file);

  const { error } = await supabase.storage
    .from("product-images")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage
    .from("product-images")
    .getPublicUrl(filePath);

  return data.publicUrl;
}

export async function requestShipmentOptions() {
  const { data, error } = await supabase
    .from("shipment_records")
    .select("id, shipment_no, tracking_no, product_name, order_store, box_count")
    .eq("status", "有效")
    .order("created_at", { ascending: false, nullsFirst: false });

  if (!error) {
    return ((data ?? []) as ShipmentOption[]).filter((item) =>
      item.shipment_no?.trim(),
    );
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("shipment_records")
    .select("id, shipment_no, tracking_no, product_name")
    .eq("status", "有效")
    .order("created_at", { ascending: false, nullsFirst: false });

  if (fallbackError) {
    throw fallbackError;
  }

  return ((fallbackData ?? []) as ShipmentOption[]).filter((item) =>
    item.shipment_no?.trim(),
  );
}
