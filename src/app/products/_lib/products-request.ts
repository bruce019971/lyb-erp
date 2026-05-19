import type { SortOrder } from "antd/es/table/interface";

import { supabase } from "@/lib/supabase";

import {
  productKeywordFields,
  type ProductFilterOptions,
  type ProductCreateValues,
  type ProductShipmentOption,
  type ProductRecord,
  type ProductUpdateValues,
} from "./products";

type ProductRequestParams = {
  current?: number;
  pageSize?: number;
} & Record<string, unknown>;

type StoreLinkRecord = {
  seller_name: string | null;
  seller_code: string | null;
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
    .select("seller_name, seller_code, seller_address")
    .in("seller_name", storeNames);

  const storeInfoMap = new Map(
    ((data ?? []) as StoreLinkRecord[])
      .filter((store) => store.seller_name)
      .map((store) => [
        store.seller_name!,
        {
          seller_code: store.seller_code,
          seller_address: store.seller_address,
        },
      ]),
  );

  return records.map((record) => ({
    ...record,
    store_code: record.store_name
      ? storeInfoMap.get(record.store_name)?.seller_code ?? null
      : null,
    store_url: record.store_name
      ? storeInfoMap.get(record.store_name)?.seller_address ?? null
      : null,
  }));
}

export async function requestProductRecords(
  params: ProductRequestParams,
  sorter: Record<string, SortOrder>,
) {
  let query = supabase
    .from("products")
    .select("*", { count: "exact" });

  productKeywordFields.forEach((field) => {
    const value = params[field];
    if (Array.isArray(value)) {
      const values = value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean);
      if (values.length > 0) {
        query = query.in(field, values);
      }
      return;
    }

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

function toUniqueOptions(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  )
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({
      label: value,
      value,
    }));
}

async function requestProductFieldOptions(field: keyof ProductRecord) {
  const { data, error } = await supabase
    .from("products")
    .select(field)
    .order(field, { ascending: true });

  if (error) {
    return [];
  }

  return toUniqueOptions(
    ((data ?? []) as ProductRecord[]).map((row) => row[field] as string | null),
  );
}

export async function requestProductFilterOptions() {
  const { data, error } = await supabase
    .from("products")
    .select("product_name, product_id, sku, store_name")
    .order("product_name", { ascending: true });

  if (!error) {
    const rows = (data ?? []) as Array<{
      product_name: string | null;
      product_id: string | null;
      sku: string | null;
      store_name: string | null;
    }>;

    const options: ProductFilterOptions = {
      productNameOptions: toUniqueOptions(rows.map((row) => row.product_name)),
      skuOptions: toUniqueOptions(rows.map((row) => row.sku)),
      storeNameOptions: toUniqueOptions(rows.map((row) => row.store_name)),
    };

    return options;
  }

  const [productNameOptions, skuOptions, storeNameOptions] = await Promise.all([
    requestProductFieldOptions("product_name"),
    requestProductFieldOptions("sku"),
    requestProductFieldOptions("store_name"),
  ]);

  return {
    productNameOptions,
    skuOptions,
    storeNameOptions,
  };
}

export async function requestProductShipmentOptions() {
  const { data, error } = await supabase
    .from("products")
    .select("id, product_name, store_name, pcs_per_carton, product_unit_price")
    .order("product_name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as ProductShipmentOption[];
}

export async function requestCustomsCodeByCategory(category?: string | null) {
  const keyword = category?.trim();
  if (!keyword) return null;

  const response = await fetch(
    `/api/customs-code?keyword=${encodeURIComponent(keyword)}`,
  );
  const payload = (await response.json().catch(() => null)) as
    | { data?: { customs_code?: string | null } | null; error?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error || "海关编码查询失败");
  }

  return payload?.data?.customs_code?.trim() || null;
}

function normalizeTextValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeSizeTextValue(value?: string | null) {
  const normalized = normalizeTextValue(value)?.replace(/\s*cm\s*$/i, "").trim();
  return normalized || null;
}

function normalizeNumberValue(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compactPayload<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== null && value !== undefined),
  ) as Partial<T>;
}

export async function createProductRecord(values: ProductCreateValues) {
  const payload = compactPayload({
    product_name: values.product_name.trim(),
    product_english_name: normalizeTextValue(values.product_english_name),
    product_id: normalizeTextValue(values.product_id),
    sku: normalizeTextValue(values.sku),
    ml_code: normalizeTextValue(values.ml_code),
    store_name: normalizeTextValue(values.store_name),
    product_image_url: normalizeTextValue(values.product_image_url),
    product_label_url: normalizeTextValue(values.product_label_url),
    product_parameters: normalizeTextValue(values.product_parameters),
    packing_list: normalizeTextValue(values.packing_list),
    color_box_size: normalizeSizeTextValue(values.color_box_size),
    single_gross_weight: normalizeNumberValue(values.single_gross_weight),
    product_unit_price: normalizeNumberValue(values.product_unit_price),
    carton_spec: normalizeSizeTextValue(values.carton_spec),
    pcs_per_carton: normalizeNumberValue(values.pcs_per_carton),
    customs_code: normalizeTextValue(values.customs_code),
    product_category: normalizeTextValue(values.product_category),
    product_usage: normalizeTextValue(values.product_usage),
    product_attribute: normalizeTextValue(values.product_attribute),
    product_material: normalizeTextValue(values.product_material),
  });

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
    product_english_name: normalizeTextValue(values.product_english_name),
    product_id: normalizeTextValue(values.product_id),
    sku: normalizeTextValue(values.sku),
    ml_code: normalizeTextValue(values.ml_code),
    store_name: normalizeTextValue(values.store_name),
    product_image_url: normalizeTextValue(values.product_image_url),
    product_label_url: normalizeTextValue(values.product_label_url),
    product_parameters: normalizeTextValue(values.product_parameters),
    packing_list: normalizeTextValue(values.packing_list),
    color_box_size: normalizeSizeTextValue(values.color_box_size),
    single_gross_weight: normalizeNumberValue(values.single_gross_weight),
    product_unit_price: normalizeNumberValue(values.product_unit_price),
    carton_spec: normalizeSizeTextValue(values.carton_spec),
    pcs_per_carton: normalizeNumberValue(values.pcs_per_carton),
    customs_code: normalizeTextValue(values.customs_code),
    product_category: normalizeTextValue(values.product_category),
    product_usage: normalizeTextValue(values.product_usage),
    product_attribute: normalizeTextValue(values.product_attribute),
    product_material: normalizeTextValue(values.product_material),
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

function getProductAssetPath(prefix: string, file: File) {
  const extension = file.name.includes(".")
    ? file.name.split(".").pop()?.toLowerCase()
    : undefined;
  const suffix = extension ? `.${extension}` : "";
  const randomId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}/${randomId}${suffix}`;
}

export async function uploadProductImage(file: File) {
  const filePath = getProductAssetPath("products", file);

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

export async function uploadProductLabel(file: File) {
  const filePath = getProductAssetPath("labels", file);

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

export async function checkProductReferences(productName: string) {
  const references: string[] = [];

  const { data: shipments } = await supabase
    .from("shipment_records")
    .select("id")
    .eq("product_name", productName)
    .limit(1);

  if (shipments && shipments.length > 0) {
    references.push("货件管理");
  }

  return references;
}

export async function deleteProductRecord(id: string, productName: string) {
  // 先检查关联
  const references = await checkProductReferences(productName);

  if (references.length > 0) {
    throw new Error(`产品被${references.join("、")}关联，请先删除关联数据`);
  }

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}
