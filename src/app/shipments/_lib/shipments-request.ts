import type { FilterValue, SortOrder } from "antd/es/table/interface";
import { message } from "antd";
import dayjs from "dayjs";

import { supabase } from "@/lib/supabase";

import {
  shipmentDateFields,
  shipmentKeywordFields,
  canEditShipmentDeliveryStatus,
  getShipmentListStatusRank,
  isShipmentDeliveryOverdue,
  isShipmentLocked,
  type ShipmentCreateValues,
  type ShipmentDateField,
  type ShipmentOption,
  type ShipmentRecord,
  type ShipmentUpdateValues,
} from "./shipments";

type ShipmentRequestParams = {
  current?: number;
  pageSize?: number;
  keyword?: string;
} & Record<string, unknown>;

const ALERT_SORT_FETCH_LIMIT = 10000;

function prioritizeShipmentAlerts(records: ShipmentRecord[]) {
  return records
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const statusRankDiff =
        getShipmentListStatusRank(left.record) -
        getShipmentListStatusRank(right.record);
      if (statusRankDiff !== 0) {
        return statusRankDiff;
      }

      const leftRank =
        getShipmentListStatusRank(left.record) === 0 &&
        isShipmentDeliveryOverdue(left.record)
          ? 0
          : 1;
      const rightRank =
        getShipmentListStatusRank(right.record) === 0 &&
        isShipmentDeliveryOverdue(right.record)
          ? 0
          : 1;

      return leftRank - rightRank || left.index - right.index;
    })
    .map(({ record }) => record);
}

export async function requestShipmentRecords(
  params: ShipmentRequestParams,
  sorter: Record<string, SortOrder>,
  filters: Record<string, FilterValue | null> = {},
) {
  const current = params.current ?? 1;
  const pageSize = params.pageSize ?? 20;
  const from = (current - 1) * pageSize;
  const to = from + pageSize - 1;
  const fetchTo = Math.max(to, ALERT_SORT_FETCH_LIMIT - 1);

  let query = supabase
    .from("shipment_records")
    .select("*", { count: "exact" })
    .eq("status", "有效");

  shipmentKeywordFields.forEach((field) => {
    const value = params[field];
    if (field !== "shipment_no" && typeof value === "string" && value.trim()) {
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
      .split(/[\s,，;；]+/)
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
  const shipmentNoParamFilters =
    typeof params.shipment_no === "string"
      ? splitFilterText(params.shipment_no)
      : normalizeMultiSelectValues(params.shipment_no);
  const allShipmentNoFilters = Array.from(
    new Set([...shipmentNoParamFilters, ...shipmentNoFilters]),
  );
  if (allShipmentNoFilters.length > 0) {
    query = query.or(buildIlikeOrFilter(["shipment_no"], allShipmentNoFilters));
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

  query = query.range(0, fetchTo);

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

  const normalizedRecords = shipmentRecords.map((item) => ({
    ...item,
    delivery_status: item.delivery_status ?? "否",
    relabel_delivery_times:
      item.is_relabel === "是" && item.shipment_no?.trim()
        ? (relabelDeliveryTimeMap.get(item.shipment_no.trim()) ?? [])
        : [],
    is_delivery_completed: item.delivery_status === "是",
  }));

  return {
    data: prioritizeShipmentAlerts(normalizedRecords).slice(from, to + 1),
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
  const hasWarehouseArrivedAt = "overseas_warehouse_arrived_at" in values;
  const hasAppointmentTime = "appointment_time" in values;
  const payload: Partial<ShipmentUpdateValues> = compactPayload({
    order_store: normalizeTextValue(values.order_store),
    logistics_provider: normalizeTextValue(values.logistics_provider),
    shipment_no: normalizeTextValue(values.shipment_no),
    tracking_no: normalizeTextValue(values.tracking_no),
    product_name: normalizeTextValue(values.product_name),
    box_count: normalizeNumberValue(values.box_count),
    pcs_per_box: normalizeNumberValue(values.pcs_per_box),
    overseas_warehouse_arrived_at: hasWarehouseArrivedAt
      ? normalizeTextValue(values.overseas_warehouse_arrived_at)
      : undefined,
    warehouse_arrived_status: hasWarehouseArrivedAt
      ? deriveWarehouseArrivedStatus(values.overseas_warehouse_arrived_at)
      : undefined,
    appointment_time: hasAppointmentTime
      ? normalizeTextValue(values.appointment_time)
      : undefined,
    is_relabel: normalizeTextValue(values.is_relabel),
    goods_value: normalizeNumberValue(values.goods_value),
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
  const { data: currentRecord, error: currentRecordError } = await supabase
    .from("shipment_records")
    .select(
      "id, delivery_status, warehouse_arrived_status, overseas_warehouse_arrived_at",
    )
    .eq("id", id)
    .single();

  if (currentRecordError) {
    throw currentRecordError;
  }

  if (isShipmentLocked(currentRecord as ShipmentRecord)) {
    throw new Error("已到仓的货件不允许修改");
  }

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

function isAppointmentBeforeMinDate(
  appointmentTime?: string | null,
  warehouseArrivedAt?: string | null,
) {
  if (!appointmentTime || !warehouseArrivedAt) return false;

  const minDate = dayjs(warehouseArrivedAt).startOf("day").add(1, "day");
  return dayjs(appointmentTime).startOf("day").isBefore(minDate);
}

export async function updateShipmentDateField(
  record: ShipmentRecord,
  field: ShipmentDateField,
  value?: string | null,
) {
  if (isShipmentLocked(record)) {
    throw new Error("已到仓的货件不允许修改");
  }

  const normalizedValue = normalizeTextValue(value);
  const payload: Partial<ShipmentUpdateValues> & { updated_at: string } = {
    updated_at: new Date().toISOString(),
  };

  if (field === "overseas_warehouse_arrived_at") {
    payload.overseas_warehouse_arrived_at = normalizedValue;
    payload.warehouse_arrived_status =
      deriveWarehouseArrivedStatus(normalizedValue);

    if (
      !normalizedValue ||
      isAppointmentBeforeMinDate(record.appointment_time, normalizedValue)
    ) {
      payload.appointment_time = null;
    }
  } else {
    if (record.is_relabel === "是") {
      throw new Error("换标货件不可编辑送仓时间");
    }

    if (normalizedValue && !record.overseas_warehouse_arrived_at) {
      throw new Error("请先设置到仓时间");
    }

    if (
      normalizedValue &&
      isAppointmentBeforeMinDate(
        normalizedValue,
        record.overseas_warehouse_arrived_at,
      )
    ) {
      throw new Error("送仓时间至少需要晚于到仓时间一天");
    }

    payload.appointment_time = normalizedValue;
  }

  const { data, error } = await supabase
    .from("shipment_records")
    .update(payload)
    .eq("id", record.id)
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
  if (isShipmentLocked(record)) {
    throw new Error("已到仓的货件不允许修改");
  }

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
  if (isShipmentLocked(record)) {
    throw new Error("已到仓的货件不允许修改");
  }

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
  username: string;
  password: string;
  code: string;
  uuid: string;
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
    .select("id, shipment_no, order_store, box_count")
    .eq("status", "有效")
    .order("created_at", { ascending: false, nullsFirst: false });

  if (!error) {
    return ((data ?? []) as ShipmentOption[]).filter((item) =>
      item.shipment_no?.trim(),
    );
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("shipment_records")
    .select("id, shipment_no")
    .eq("status", "有效")
    .order("created_at", { ascending: false, nullsFirst: false });

  if (fallbackError) {
    throw fallbackError;
  }

  return ((fallbackData ?? []) as ShipmentOption[]).filter((item) =>
    item.shipment_no?.trim(),
  );
}
