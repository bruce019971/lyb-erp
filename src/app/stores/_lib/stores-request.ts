import type { SortOrder } from "antd/es/table/interface";

import { supabase } from "@/lib/supabase";

import {
  storeKeywordFields,
  type StoreCreateValues,
  type StoreOption,
  type StoreUpdateValues,
  type StoreRecord,
} from "./stores";

type StoreRequestParams = {
  current?: number;
  pageSize?: number;
} & Record<string, unknown>;

export async function requestStoreRecords(
  params: StoreRequestParams,
  sorter: Record<string, SortOrder>,
) {
  const current = params.current ?? 1;
  const pageSize = params.pageSize ?? 20;
  const from = (current - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("stores")
    .select("*", { count: "exact" })
    .range(from, to);

  storeKeywordFields.forEach((field) => {
    const value = params[field];
    if (typeof value === "string" && value.trim()) {
      query = query.ilike(field, `%${value.trim()}%`);
    }
  });

  const orderField = Object.keys(sorter ?? {})[0];
  const orderDirection = orderField ? sorter[orderField] : undefined;

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
    return {
      data: [],
      success: false,
      total: 0,
    };
  }

  return {
    data: (data ?? []) as StoreRecord[],
    success: true,
    total: count ?? 0,
  };
}

function normalizeTextValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function createStoreRecord(values: StoreCreateValues) {
  const payload = {
    seller_id: values.seller_id.trim(),
    seller_name: values.seller_name.trim(),
    seller_address: normalizeTextValue(values.seller_address),
    seller_type: normalizeTextValue(values.seller_type) ?? "CBT",
  };

  const { data, error } = await supabase
    .from("stores")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as StoreRecord;
}

export async function updateStoreRecord(id: string, values: StoreUpdateValues) {
  const payload = {
    seller_id: values.seller_id.trim(),
    seller_name: values.seller_name.trim(),
    seller_address: normalizeTextValue(values.seller_address),
    seller_type: normalizeTextValue(values.seller_type) ?? "CBT",
  };

  const { data, error } = await supabase
    .from("stores")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as StoreRecord;
}

export async function requestStoreOptions() {
  const { data, error } = await supabase
    .from("stores")
    .select("id, seller_name")
    .order("seller_name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as StoreOption[];
}
