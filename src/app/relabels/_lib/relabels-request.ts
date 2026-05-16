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
  sorter: Record<string, SortOrder>,
) {
  const current = params.current ?? 1;
  const pageSize = params.pageSize ?? 20;
  const from = (current - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("relabel_records")
    .select("*", { count: "exact" })
    .range(from, to);

  const orderField = Object.keys(sorter ?? {})[0];
  const orderDirection = orderField ? sorter[orderField] : undefined;

  if (orderField && orderDirection) {
    query = query.order(orderField, {
      ascending: orderDirection === "ascend",
    });
  } else {
    query = query.order("delivery_time", {
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
