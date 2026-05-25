import type { SortOrder } from "antd/es/table/interface";

import { supabase } from "@/lib/supabase";

import type {
  RelabelCreateValues,
  RelabelRecord,
  RelabelUpdateValues,
} from "./relabels";

type RelabelRequestParams = {
  current?: number;
  pageSize?: number;
} & Record<string, unknown>;

export async function requestRelabelRecords(
  params: RelabelRequestParams,
  sorter: Record<string, SortOrder> = {},
) {
  const current = params.current ?? 1;
  const pageSize = params.pageSize ?? 20;
  const from = (current - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("relabel_records")
    .select("*", { count: "exact" })
    .range(from, to);

  function splitShipmentNos(value: unknown) {
    const rawValues = Array.isArray(value) ? value : [value];

    return rawValues
      .filter((item): item is string => typeof item === "string")
      .flatMap((item) =>
        item
          .split(/[\s,，]+/)
          .map((item) => item.trim())
          .filter(Boolean),
      );
  }

  function normalizeFilterValue(value: string) {
    return value.replace(/[(),，]/g, " ").trim();
  }

  function buildIlikeOrFilter(field: string, values: string[]) {
    return values
      .map(normalizeFilterValue)
      .filter(Boolean)
      .map((value) => `${field}.ilike.%${value}%`)
      .join(",");
  }

  const shipmentNoFilters = [
    buildIlikeOrFilter(
      "original_shipment_no",
      splitShipmentNos(params.original_shipment_no),
    ),
    buildIlikeOrFilter(
      "delivery_shipment_no",
      splitShipmentNos(params.delivery_shipment_no),
    ),
  ].filter(Boolean);
  shipmentNoFilters.forEach((filter) => {
    query = query.or(filter);
  });

  const originalShipmentNos = splitShipmentNos(params.original_shipment_no);
  if (
    originalShipmentNos.length === 1 &&
    typeof params.original_shipment_no === "string"
  ) {
    query = query.ilike(
      "original_shipment_no",
      `%${normalizeFilterValue(originalShipmentNos[0])}%`,
    );
  }

  function normalizeMultiSelectValues(value: unknown) {
    const values = Array.isArray(value) ? value : [value];

    return values
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }

  const logisticsProviderValues = normalizeMultiSelectValues(
    params.logistics_provider,
  );
  if (logisticsProviderValues.length > 0) {
    const { data: shipmentRows, error: shipmentError } = await supabase
      .from("shipment_records")
      .select("shipment_no")
      .eq("status", "有效")
      .in("logistics_provider", logisticsProviderValues)
      .not("shipment_no", "is", null)
      .range(0, 9999);

    if (shipmentError) {
      return {
        data: [],
        success: false,
        total: 0,
      };
    }

    const shipmentNos = Array.from(
      new Set(
        (shipmentRows ?? [])
          .map((item) =>
            typeof item.shipment_no === "string" ? item.shipment_no.trim() : "",
          )
          .filter(Boolean),
      ),
    );

    if (shipmentNos.length === 0) {
      return {
        data: [],
        success: true,
        total: 0,
      };
    }

    query = query.in("original_shipment_no", shipmentNos);
  }

  const orderField = Object.keys(sorter ?? {})[0];
  const orderDirection = orderField ? sorter[orderField] : undefined;

  if (orderField && orderDirection) {
    query = query.order(orderField, {
      ascending: orderDirection === "ascend",
    });
  } else {
    query = query
      .order("delivery_status", { ascending: true })
      .order("delivery_time", {
        ascending: true,
        nullsFirst: false,
      });
  }

  const { data, error, count } = await query;

  if (error) {
    return {
      data: [],
      success: false,
      total: 0,
    };
  }

  return {
    data: (data ?? []) as RelabelRecord[],
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

function compactPayload<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export async function createRelabelRecord(values: RelabelCreateValues) {
  const payload = {
    original_shipment_no: values.original_shipment_no.trim(),
    delivery_store: normalizeTextValue(values.delivery_store),
    delivery_shipment_no: normalizeTextValue(values.delivery_shipment_no),
    box_count: normalizeNumberValue(values.box_count),
    product_count: normalizeNumberValue(values.product_count),
    relabel_fee: normalizeNumberValue(values.relabel_fee),
    relabel_type: normalizeTextValue(values.relabel_type),
    instruction_submitted: normalizeTextValue(values.instruction_submitted) ?? "否",
    delivery_status: normalizeTextValue(values.delivery_status) ?? "否",
    delivery_time: normalizeTextValue(values.delivery_time),
  };

  const { data, error } = await supabase
    .from("relabel_records")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as RelabelRecord;
}

export async function updateRelabelRecord(
  id: string,
  values: RelabelUpdateValues,
) {
  const payload = compactPayload({
    original_shipment_no: values.original_shipment_no.trim(),
    delivery_store: normalizeTextValue(values.delivery_store),
    delivery_shipment_no: normalizeTextValue(values.delivery_shipment_no),
    box_count: normalizeNumberValue(values.box_count),
    product_count: normalizeNumberValue(values.product_count),
    relabel_fee: normalizeNumberValue(values.relabel_fee),
    relabel_type: normalizeTextValue(values.relabel_type),
    instruction_submitted:
      values.instruction_submitted === undefined
        ? undefined
        : normalizeTextValue(values.instruction_submitted) ?? "否",
    delivery_status:
      values.delivery_status === undefined
        ? undefined
        : normalizeTextValue(values.delivery_status) ?? "否",
    delivery_time: normalizeTextValue(values.delivery_time),
  });

  const { data, error } = await supabase
    .from("relabel_records")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as RelabelRecord;
}

export async function markRelabelStatusAsYes(
  id: string,
  field: "instruction_submitted" | "delivery_status",
) {
  const { data, error } = await supabase
    .from("relabel_records")
    .update({ [field]: "是" })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as RelabelRecord;
}

export async function deleteRelabelRecord(id: string) {
  const response = await fetch(`/api/relabels/${id}`, {
    method: "DELETE",
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error || "删除失败");
  }
}
