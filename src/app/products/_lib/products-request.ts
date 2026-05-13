import type { SortOrder } from "antd/es/table/interface";

import { supabase } from "@/lib/supabase";

import {
  productKeywordFields,
  type ProductCreateValues,
  type ProductRecord,
  type ProductUpdateValues,
} from "./products";

type ProductRequestParams = {
  current?: number;
  pageSize?: number;
} & Record<string, unknown>;

type StoreLinkRecord = {
  seller_name: string | null;
  seller_address: string | null;
};

async function attachStoreUrls(records: ProductRecord[]) {
  const storeNames = Array.from(
    new Set(
      records
        .map((record) => record.store_name?.trim())
        .filter((storeName): storeName is string => Boolean(storeName)),
    ),
  );

  if (!storeNames.length) return records;

  const { data } = await supabase
    .from("stores")
    .select("seller_name, seller_address")
    .in("seller_name", storeNames);

  const storeUrlMap = new Map(
    ((data ?? []) as StoreLinkRecord[])
      .filter((store) => store.seller_name)
      .map((store) => [store.seller_name!, store.seller_address]),
  );

  return records.map((record) => ({
    ...record,
    store_url: record.store_name
      ? storeUrlMap.get(record.store_name) ?? null
      : null,
  }));
}

export async function requestProductRecords(
  params: ProductRequestParams,
  sorter: Record<string, SortOrder>,
) {
  const current = params.current ?? 1;
  const pageSize = params.pageSize ?? 20;
  const from = (current - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("products")
    .select("*", { count: "exact" })
    .range(from, to);

  productKeywordFields.forEach((field) => {
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

  const records = (data ?? []) as ProductRecord[];

  return {
    data: await attachStoreUrls(records),
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

export async function createProductRecord(values: ProductCreateValues) {
  const payload = {
    product_name: values.product_name.trim(),
    product_url: normalizeTextValue(values.product_url),
    product_id: normalizeTextValue(values.product_id),
    sku: normalizeTextValue(values.sku),
    ml_code: normalizeTextValue(values.ml_code),
    store_name: normalizeTextValue(values.store_name),
    product_image_url: normalizeTextValue(values.product_image_url),
    product_parameters: normalizeTextValue(values.product_parameters),
    packing_list: normalizeTextValue(values.packing_list),
    color_box_size: normalizeTextValue(values.color_box_size),
    single_gross_weight: normalizeNumberValue(values.single_gross_weight),
    carton_spec: normalizeTextValue(values.carton_spec),
    pcs_per_carton: normalizeNumberValue(values.pcs_per_carton),
  };

  const { error } = await supabase.from("products").insert(payload);

  if (error) {
    throw error;
  }
}

export async function updateProductRecord(
  id: string,
  values: ProductUpdateValues,
) {
  const payload = {
    product_name: values.product_name.trim(),
    product_url: normalizeTextValue(values.product_url),
    product_id: normalizeTextValue(values.product_id),
    sku: normalizeTextValue(values.sku),
    ml_code: normalizeTextValue(values.ml_code),
    store_name: normalizeTextValue(values.store_name),
    product_image_url: normalizeTextValue(values.product_image_url),
    product_parameters: normalizeTextValue(values.product_parameters),
    packing_list: normalizeTextValue(values.packing_list),
    color_box_size: normalizeTextValue(values.color_box_size),
    single_gross_weight: normalizeNumberValue(values.single_gross_weight),
    carton_spec: normalizeTextValue(values.carton_spec),
    pcs_per_carton: normalizeNumberValue(values.pcs_per_carton),
  };

  const { data, error } = await supabase
    .from("products")
    .update(payload)
    .eq("id", id)
    .select("id, product_image_url")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("产品未被更新，请检查 Supabase products 表的 update 权限策略");
  }
}

function getProductImagePath(file: File) {
  const extension = file.name.includes(".")
    ? file.name.split(".").pop()?.toLowerCase()
    : undefined;
  const suffix = extension ? `.${extension}` : "";
  const randomId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `products/${randomId}${suffix}`;
}

export async function uploadProductImage(file: File) {
  const filePath = getProductImagePath(file);

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
