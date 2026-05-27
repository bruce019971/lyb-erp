import type { SortOrder } from "antd/es/table/interface";

import { supabase } from "@/lib/supabase";

import {
  logisticsKeywordFields,
  type LogisticsProviderCreateValues,
  type LogisticsProviderOption,
  type LogisticsProviderRecord,
  type LogisticsProviderUpdateValues,
} from "./logistics";

type LogisticsProviderRequestParams = {
  current?: number;
  pageSize?: number;
} & Record<string, unknown>;

export async function requestLogisticsProviderRecords(
  params: LogisticsProviderRequestParams,
  sorter: Record<string, SortOrder>,
) {
  const current = params.current ?? 1;
  const pageSize = params.pageSize ?? 20;
  const from = (current - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("logistics_providers")
    .select("*", { count: "exact" })
    .range(from, to);

  logisticsKeywordFields.forEach((field) => {
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
    data: (data ?? []) as LogisticsProviderRecord[],
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

export async function createLogisticsProviderRecord(
  values: LogisticsProviderCreateValues,
) {
  const payload = {
    provider_name: values.provider_name.trim(),
    system_url: normalizeTextValue(values.system_url),
    username: normalizeTextValue(values.username),
    password: normalizeTextValue(values.password),
    invoice_template_url: normalizeTextValue(values.invoice_template_url),
    general_freight_unit_price: normalizeNumberValue(
      values.general_freight_unit_price,
    ),
    textile_freight_unit_price: normalizeNumberValue(
      values.textile_freight_unit_price,
    ),
    product_label_unit_price: normalizeNumberValue(
      values.product_label_unit_price,
    ),
    carton_label_unit_price: normalizeNumberValue(
      values.carton_label_unit_price,
    ),
  };

  const { data, error } = await supabase
    .from("logistics_providers")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as LogisticsProviderRecord;
}

export async function updateLogisticsProviderRecord(
  id: string,
  values: LogisticsProviderUpdateValues,
) {
  const payload = {
    provider_name: values.provider_name.trim(),
    system_url: normalizeTextValue(values.system_url),
    username: normalizeTextValue(values.username),
    password: normalizeTextValue(values.password),
    invoice_template_url: normalizeTextValue(values.invoice_template_url),
    general_freight_unit_price: normalizeNumberValue(
      values.general_freight_unit_price,
    ),
    textile_freight_unit_price: normalizeNumberValue(
      values.textile_freight_unit_price,
    ),
    product_label_unit_price: normalizeNumberValue(
      values.product_label_unit_price,
    ),
    carton_label_unit_price: normalizeNumberValue(
      values.carton_label_unit_price,
    ),
  };

  const { data, error } = await supabase
    .from("logistics_providers")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as LogisticsProviderRecord;
}

export async function requestLogisticsProviderOptions() {
  const { data, error } = await supabase
    .from("logistics_providers")
    .select(
      "id, provider_name, system_url, username, password, invoice_template_url, general_freight_unit_price, textile_freight_unit_price, product_label_unit_price, carton_label_unit_price",
    )
    .order("provider_name", { ascending: true });

  if (!error) {
    return (data ?? []) as LogisticsProviderOption[];
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("logistics_providers")
    .select("id, provider_name, system_url, username, password, invoice_template_url")
    .order("provider_name", { ascending: true });

  if (fallbackError) {
    throw fallbackError;
  }

  return (fallbackData ?? []) as LogisticsProviderOption[];
}

function getLogisticsAssetPath(prefix: string, file: File) {
  const extension = file.name.includes(".")
    ? file.name.split(".").pop()?.toLowerCase()
    : undefined;
  const suffix = extension ? `.${extension}` : "";
  const randomId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}/${randomId}${suffix}`;
}

export async function uploadLogisticsInvoiceTemplate(file: File) {
  const filePath = getLogisticsAssetPath("logistics-invoice-templates", file);
  const storageResponse = await fetch("/api/logistics/invoice-template-storage", {
    method: "POST",
  });

  if (!storageResponse.ok) {
    const payload = (await storageResponse.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error || "发票模板存储配置更新失败");
  }

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
