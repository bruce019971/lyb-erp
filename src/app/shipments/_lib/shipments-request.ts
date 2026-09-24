import type { FilterValue, SortOrder } from "antd/es/table/interface";
import { message } from "antd";

import { supabase } from "@/lib/supabase";

import {
  shipmentDateFields,
  shipmentKeywordFields,
  canEditShipmentDeliveryStatus,
  canEditShipmentInstructionStatus,
  type ShipmentCreateValues,
  type ShipmentOption,
  type ShipmentRecord,
  type ShipmentRelabelRecord,
  type ShipmentUpdateValues,
} from "./shipments";

type ShipmentRequestParams = {
  current?: number;
  pageSize?: number;
  keyword?: string;
  long_term_inventory?: boolean;
  expiring_shipments?: boolean;
  expiring_local_store_names?: string[];
} & Record<string, unknown>;

type DateLikeValue = {
  format: (template: string) => string;
};

interface ShipmentSearchQuery {
  ilike(field: string, value: string): this;
  in(field: string, values: string[]): this;
  not(field: string, operator: string, value: unknown): this;
  is(field: string, value: unknown): this;
  eq(field: string, value: string): this;
  or(filters: string): this;
  gte(field: string, value: unknown): this;
  lte(field: string, value: unknown): this;
}

export type ShipmentSummary = {
  boxCount: number;
  totalQty: number;
  goodsValue: number;
  total: number;
};

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

function normalizeDateRangeValue(
  field: string,
  value: unknown,
  boundary: "start" | "end",
) {
  function isDateLikeValue(item: unknown): item is DateLikeValue {
    return (
      typeof item === "object" &&
      item !== null &&
      "format" in item &&
      typeof item.format === "function"
    );
  }

  const dateValue =
    isDateLikeValue(value)
      ? value.format("YYYY-MM-DD")
      : value;
  if (typeof dateValue !== "string" || !dateValue) return dateValue;
  if (field !== "created_at") return dateValue;
  return boundary === "start"
    ? `${dateValue}T00:00:00`
    : `${dateValue}T23:59:59.999`;
}

function getLongTermInventoryCutoffDate() {
  const date = new Date();
  date.setDate(date.getDate() - 25);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getExpiringShipmentCutoffDateTime() {
  const date = new Date();
  date.setDate(date.getDate() - 54);

  return date.toISOString();
}

function applyShipmentSearchParams<TQuery extends ShipmentSearchQuery>(
  query: TQuery,
  params: ShipmentRequestParams,
  relabelShipmentNos: string[] = [],
) {
  let nextQuery = query;

  shipmentKeywordFields.forEach((field) => {
    if (field === "shipment_no" || field === "tracking_no") return;

    const value = params[field];
    if (typeof value === "string" && value.trim()) {
      nextQuery = nextQuery.ilike(field, `%${value.trim()}%`);
    }
  });

  const orderStoreValues = normalizeMultiSelectValues(params.order_store);
  if (orderStoreValues.length > 0) {
    nextQuery = nextQuery.in("order_store", orderStoreValues);
  }

  const shipmentNoValues = splitSearchTexts(params.shipment_no);
  if (shipmentNoValues.length > 0) {
    nextQuery = nextQuery.in("shipment_no", shipmentNoValues);
  }

  const trackingNoValues = splitSearchTexts(params.tracking_no);
  if (trackingNoValues.length > 0) {
    nextQuery = nextQuery.in("tracking_no", trackingNoValues);
  }

  const logisticsProviderValues = normalizeMultiSelectValues(
    params.logistics_provider,
  );
  if (logisticsProviderValues.length > 0) {
    nextQuery = nextQuery.in("logistics_provider", logisticsProviderValues);
  }

  const productNameValues = normalizeMultiSelectValues(params.product_name);
  if (productNameValues.length > 0) {
    nextQuery = nextQuery.in("product_name", productNameValues);
  }

  const warehouseArrivedStatus =
    typeof params.warehouse_arrived_status === "string"
      ? params.warehouse_arrived_status.trim()
      : "";
  if (warehouseArrivedStatus === "是") {
    nextQuery = nextQuery.not("overseas_warehouse_arrived_at", "is", null);
  } else if (warehouseArrivedStatus === "否") {
    nextQuery = nextQuery.is("overseas_warehouse_arrived_at", null);
  }

  const unappointed =
    typeof params.unappointed === "string" ? params.unappointed.trim() : "";
  if (unappointed === "是") {
    nextQuery = nextQuery.is("appointment_time", null);
  } else if (unappointed === "否") {
    nextQuery = nextQuery.not("appointment_time", "is", null);
  }

  const deliveryStatus =
    typeof params.delivery_status === "string"
      ? params.delivery_status.trim()
      : "";
  if (deliveryStatus === "是" || deliveryStatus === "否") {
    nextQuery = nextQuery.eq("delivery_status", deliveryStatus);
  }

  const instructionSubmitted =
    typeof params.instruction_submitted === "string"
      ? params.instruction_submitted.trim()
      : "";
  if (instructionSubmitted === "是" || instructionSubmitted === "否") {
    nextQuery = nextQuery.eq("instruction_submitted", instructionSubmitted);
  }

  const isRelabel =
    typeof params.is_relabel === "string" ? params.is_relabel.trim() : "";
  if (isRelabel === "是") {
    nextQuery = relabelShipmentNos.length
      ? nextQuery.in("shipment_no", relabelShipmentNos)
      : nextQuery.is("id", null);
  } else if (isRelabel === "否") {
    for (let index = 0; index < relabelShipmentNos.length; index += 100) {
      const values = relabelShipmentNos.slice(index, index + 100).map((value) => JSON.stringify(value)).join(",");
      nextQuery = nextQuery.or(`shipment_no.is.null,shipment_no.not.in.(${values})`);
    }
  }

  shipmentDateFields.forEach((field) => {
    const value = params[field];
    if (!Array.isArray(value)) return;

    const [start, end] = value;
    const normalizedStart = normalizeDateRangeValue(field, start, "start");
    const normalizedEnd = normalizeDateRangeValue(field, end, "end");
    if (normalizedStart) nextQuery = nextQuery.gte(field, normalizedStart);
    if (normalizedEnd) nextQuery = nextQuery.lte(field, normalizedEnd);
  });

  if (params.long_term_inventory === true) {
    nextQuery = nextQuery
      .not("overseas_warehouse_arrived_at", "is", null)
      .lte("overseas_warehouse_arrived_at", getLongTermInventoryCutoffDate())
      .or("delivery_status.is.null,delivery_status.neq.是");
  }

  if (params.expiring_shipments === true) {
    const localStoreNames = normalizeMultiSelectValues(
      params.expiring_local_store_names,
    );

    nextQuery =
      localStoreNames.length > 0
        ? nextQuery.in("order_store", localStoreNames)
        : nextQuery.is("id", null);
    nextQuery = nextQuery
      .lte("created_at", getExpiringShipmentCutoffDateTime())
      .is("appointment_time", null);
  }

  return nextQuery as TQuery;
}

function toFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function getProductKey(productName?: string | null, storeName?: string | null) {
  return `${productName?.trim() ?? ""}\u0000${storeName?.trim() ?? ""}`;
}

async function attachProductMlCodes(records: ShipmentRecord[]) {
  const productNames = Array.from(
    new Set(
      records
        .map((item) => item.product_name?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  );

  if (productNames.length === 0) return records;

  const { data, error } = await supabase
    .from("products")
    .select("product_name, store_name, ml_code, product_label_url")
    .in("product_name", productNames)
    .eq("status", "有效");

  if (error) {
    message.error(error.message);
    return records;
  }

  const productRows = (data ?? []) as Array<{
    product_name: string | null;
    store_name: string | null;
    ml_code: string | null;
    product_label_url: string | null;
  }>;
  const storeNames = Array.from(
    new Set(
      productRows
        .map((item) => item.store_name?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  );
  const storeCodeMap = new Map<string, string | null>();

  if (storeNames.length > 0) {
    const { data: storeData, error: storeError } = await supabase
      .from("stores")
      .select("seller_name, seller_code")
      .in("seller_name", storeNames);

    if (storeError) {
      message.error(storeError.message);
    } else {
      ((storeData ?? []) as Array<{
        seller_name: string | null;
        seller_code: string | null;
      }>).forEach((item) => {
        const storeName = item.seller_name?.trim();
        if (!storeName) return;

        storeCodeMap.set(storeName, item.seller_code);
      });
    }
  }
  const productMap = new Map(
    productRows
      .filter((item) => item.product_name?.trim())
      .map((item) => [getProductKey(item.product_name, item.store_name), item]),
  );
  const productFallbackMap = new Map(
    productRows
      .filter((item) => item.product_name?.trim())
      .map((item) => [item.product_name!.trim(), item]),
  );

  return records.map((record) => {
    const productName = record.product_name?.trim();
    const storeName = record.order_store?.trim();
    const product =
      productMap.get(getProductKey(productName, storeName)) ||
      (!storeName && productName
        ? productFallbackMap.get(productName)
        : undefined);

    return {
      ...record,
      ml_code: product?.ml_code ?? record.ml_code ?? null,
      product_label_url:
        product?.product_label_url ?? record.product_label_url ?? null,
      store_code: product?.store_name
        ? (storeCodeMap.get(product.store_name.trim()) ?? record.store_code ?? null)
        : (record.store_code ?? null),
    };
  });
}

async function requestShipmentRelabelMap() {
  const result = new Map<string, ShipmentRelabelRecord[]>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("relabel_records")
      .select("id, original_shipment_no, delivery_store, delivery_shipment_no, delivery_time")
      .order("delivery_time", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;

    const rows = (data ?? []) as ShipmentRelabelRecord[];
    rows.forEach((row) => {
      const shipmentNo = row.original_shipment_no?.trim();
      if (!shipmentNo) return;
      const records = result.get(shipmentNo) ?? [];
      records.push(row);
      result.set(shipmentNo, records);
    });
    if (rows.length < pageSize) return result;
  }
}

export async function requestShipmentRecords(
  params: ShipmentRequestParams,
  sorter: Record<string, SortOrder>,
  filters: Record<string, FilterValue | null> = {},
) {
  let relabelMap: Map<string, ShipmentRelabelRecord[]>;
  try {
    relabelMap = await requestShipmentRelabelMap();
  } catch (error) {
    message.error(error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "读取换标记录失败");
    return { data: [], success: false, total: 0 };
  }
  let query = supabase
    .from("shipment_records")
    .select("*", { count: "exact" })
    .eq("status", "有效");

  query = applyShipmentSearchParams(query, params, [...relabelMap.keys()]);

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

  const shipmentRecords = await attachProductMlCodes(
    (data ?? []) as ShipmentRecord[],
  );
  return {
    data: shipmentRecords.map((item) => {
      const relabels = relabelMap.get(item.shipment_no?.trim() ?? "") ?? [];
      return {
        ...item,
        delivery_status: item.delivery_status ?? "否",
        is_relabel: relabels.length ? "是" : "否",
        relabel_records: relabels,
        relabel_delivery_times: Array.from(new Set(
          relabels.map((record) => record.delivery_time).filter((value): value is string => Boolean(value)),
        )),
        is_delivery_completed: item.delivery_status === "是",
      };
    }),
    success: true,
    total: count ?? 0,
  };
}

export async function requestShipmentSummary(
  params: ShipmentRequestParams,
): Promise<ShipmentSummary> {
  const isRelabel = typeof params.is_relabel === "string" ? params.is_relabel.trim() : "";
  const relabelShipmentNos = isRelabel === "是" || isRelabel === "否"
    ? [...(await requestShipmentRelabelMap()).keys()]
    : [];
  const pageSize = 1000;
  let page = 0;
  let summary: ShipmentSummary = {
    boxCount: 0,
    totalQty: 0,
    goodsValue: 0,
    total: 0,
  };

  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    let query = supabase
      .from("shipment_records")
      .select("box_count, total_qty, goods_value")
      .eq("status", "有效")
      .range(from, to);

    query = applyShipmentSearchParams(query, params, relabelShipmentNos);

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const rows = data ?? [];
    rows.forEach((item) => {
      summary = {
        boxCount: summary.boxCount + toFiniteNumber(item.box_count),
        totalQty: summary.totalQty + toFiniteNumber(item.total_qty),
        goodsValue: summary.goodsValue + toFiniteNumber(item.goods_value),
        total: summary.total + 1,
      };
    });

    if (rows.length < pageSize) {
      return {
        ...summary,
        boxCount: Number(summary.boxCount.toFixed(2)),
        totalQty: Number(summary.totalQty.toFixed(2)),
        goodsValue: Number(summary.goodsValue.toFixed(2)),
      };
    }

    page += 1;
  }
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
    tracking_no:
      values.tracking_no === undefined
        ? undefined
        : normalizeTextValue(values.tracking_no),
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
  if (!canEditShipmentDeliveryStatus(record)) {
    throw new Error("必须设置送仓时间且已到达送仓日期，才能修改是否送仓");
  }

  if (value !== "是" && value !== "否") {
    throw new Error("是否送仓只能设置为是或否");
  }
  const normalizedValue = value;

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

export async function updateShipmentInstructionStatus(
  record: ShipmentRecord,
  value: string,
) {
  if (value !== "是" && value !== "否") {
    throw new Error("是否提交指令只能设置为是或否");
  }
  if (!canEditShipmentInstructionStatus(record)) {
    throw new Error("请先设置送仓时间，再修改是否提交指令");
  }

  const { data, error } = await supabase
    .from("shipment_records")
    .update({ instruction_submitted: value, updated_at: new Date().toISOString() })
    .eq("id", record.id)
    .eq("status", "有效")
    .select("*")
    .single();

  if (error) throw error;
  return data as ShipmentRecord;
}

export async function batchMarkShipmentInstructionsSubmitted(records: ShipmentRecord[]) {
  const uniqueRecords = Array.from(new Map(records.map((record) => [record.id, record])).values());
  const succeeded: ShipmentRecord[] = [];
  const failures: Array<{ id: string; message: string }> = [];

  for (let index = 0; index < uniqueRecords.length; index += 5) {
    const batch = uniqueRecords.slice(index, index + 5);
    const results = await Promise.allSettled(
      batch.map((record) => updateShipmentInstructionStatus(record, "是")),
    );
    results.forEach((result, resultIndex) => {
      if (result.status === "fulfilled") {
        succeeded.push(result.value);
      } else {
        failures.push({
          id: batch[resultIndex].id,
          message: typeof result.reason?.message === "string"
            ? result.reason.message
            : "更新是否提交指令失败",
        });
      }
    });
  }

  return { succeeded, failures };
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

export class ShipmentBatchDeleteRequiresForceError extends Error {
  shipmentNos: string[];

  constructor(message: string, shipmentNos: string[]) {
    super(message);
    this.name = "ShipmentBatchDeleteRequiresForceError";
    this.shipmentNos = shipmentNos;
  }
}

export async function deleteShipmentRecords(
  ids: string[],
  options: { force?: boolean } = {},
) {
  const response = await fetch("/api/shipments/batch-delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids, force: options.force === true }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { code?: string; error?: string; shipmentNos?: string[] }
    | null;

  if (!response.ok) {
    if (payload?.code === "SHIPMENT_TRACKING_NO_EXISTS") {
      throw new ShipmentBatchDeleteRequiresForceError(
        payload.error || "存在已有运单编号的货件",
        Array.isArray(payload.shipmentNos) ? payload.shipmentNos : [],
      );
    }

    throw new Error(payload?.error || "批量删除失败");
  }
}

export type ShipmentFileUrlField =
  | "carton_label_url"
  | "logistics_box_mark_url"
  | "order_invoice_url";

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

export async function submitSaleasyLogisticsOrder(values: { shipmentId: string }) {
  const response = await fetch("/api/shipments/saleasy-order-submit", {
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
        fileurl?: string;
        error?: string;
      }
    | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error || "赛易物流下单失败");
  }

  return {
    record: payload.data,
    packno: payload.trackingNo?.trim() || "",
    waybillId: payload.waybillId?.trim() || "",
    fileurl: payload.fileurl?.trim() || "",
  };
}

export async function generateShipmentSaleasyLogisticsBoxMark(values: {
  shipmentId: string;
}) {
  const response = await fetch("/api/shipments/saleasy-logistics-box-mark", {
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
    throw new Error(payload?.error || "赛易物流箱唛生成失败");
  }

  return {
    record: payload.data,
    fileurl: payload.fileurl?.trim() || "",
    trackingNo: payload.trackingNo?.trim() || "",
    waybillId: payload.waybillId?.trim() || "",
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
    .select(
      "id, shipment_no, tracking_no, product_name, order_store, box_count, pcs_per_box, total_qty, logistics_provider, warehouse_arrived_status",
    )
    .eq("status", "有效")
    .order("created_at", { ascending: false, nullsFirst: false });

  if (!error) {
    return ((data ?? []) as ShipmentOption[]).filter((item) =>
      item.shipment_no?.trim(),
    );
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("shipment_records")
    .select(
      "id, shipment_no, tracking_no, product_name, logistics_provider, warehouse_arrived_status, pcs_per_box, total_qty",
    )
    .eq("status", "有效")
    .order("created_at", { ascending: false, nullsFirst: false });

  if (fallbackError) {
    throw fallbackError;
  }

  return ((fallbackData ?? []) as ShipmentOption[]).filter((item) =>
    item.shipment_no?.trim(),
  );
}
