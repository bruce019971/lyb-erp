import type { SortOrder } from "antd/es/table/interface";

import { supabase } from "@/lib/supabase";

import type {
  DamageCreateValues,
  DamageRecord,
  DamageShipmentOption,
} from "./damages";

type DamageRequestParams = {
  current?: number;
  pageSize?: number;
} & Record<string, unknown>;

const DAMAGE_SUMMARY_PAGE_SIZE = 1000;

type ShipmentTrackingRow = {
  id: string;
  tracking_no: string | null;
};

type DamageFilterState = {
  deliveryShipmentNos: string[];
  productNames: string[];
  deliveryStores: string[];
  matchedShipmentIds: string[] | null;
};

function normalizeMultiSelectValues(value: unknown) {
  const values = Array.isArray(value) ? value : [value];

  return Array.from(
    new Set(
      values
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
}

async function resolveDamageFilterState(
  params: DamageRequestParams,
): Promise<DamageFilterState> {
  const logisticsProviders = normalizeMultiSelectValues(
    params.logistics_provider,
  );
  let matchedShipmentIds: string[] | null = null;

  if (logisticsProviders.length > 0) {
    const { data, error } = await supabase
      .from("shipment_records")
      .select("id")
      .in("logistics_provider", logisticsProviders)
      .range(0, 9999);

    if (error) throw error;

    matchedShipmentIds = (data ?? [])
      .map((item) => item.id)
      .filter((item): item is string => Boolean(item));
  }

  return {
    deliveryShipmentNos: normalizeMultiSelectValues(
      params.delivery_shipment_no,
    ),
    productNames: normalizeMultiSelectValues(params.product_name),
    deliveryStores: normalizeMultiSelectValues(params.delivery_store),
    matchedShipmentIds,
  };
}

export async function requestDamageRecords(
  params: DamageRequestParams,
  sorter: Record<string, SortOrder> = {},
) {
  const filterState = await resolveDamageFilterState(params);
  if (filterState.matchedShipmentIds?.length === 0) {
    return { data: [], success: true, total: 0 };
  }

  const current = params.current ?? 1;
  const pageSize = params.pageSize ?? 20;
  const from = (current - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("damage_records")
    .select("*", { count: "exact" })
    .range(from, to);

  if (filterState.deliveryShipmentNos.length > 0) {
    query = query.in(
      "delivery_shipment_no",
      filterState.deliveryShipmentNos,
    );
  }

  if (filterState.productNames.length > 0) {
    query = query.in("product_name", filterState.productNames);
  }

  if (filterState.deliveryStores.length > 0) {
    query = query.in("delivery_store", filterState.deliveryStores);
  }

  if (filterState.matchedShipmentIds) {
    query = query.in("shipment_record_id", filterState.matchedShipmentIds);
  }

  const deliveryDate = params.delivery_date;
  if (Array.isArray(deliveryDate)) {
    const [start, end] = deliveryDate;
    if (typeof start === "string" && start) {
      query = query.gte("delivery_date", start);
    }
    if (typeof end === "string" && end) {
      query = query.lte("delivery_date", end);
    }
  }

  const orderField = Object.keys(sorter)[0];
  const orderDirection = orderField ? sorter[orderField] : undefined;
  if (orderField && orderDirection) {
    query = query.order(orderField, {
      ascending: orderDirection === "ascend",
    });
  } else {
    query = query
      .order("delivery_date", { ascending: false })
      .order("created_at", { ascending: false, nullsFirst: false });
  }

  const { data, error, count } = await query;
  if (error) {
    return { data: [], success: false, total: 0 };
  }

  const records = (data ?? []) as DamageRecord[];
  const shipmentRecordIds = Array.from(
    new Set(
      records
        .map((item) => item.shipment_record_id)
        .filter((item): item is string => Boolean(item)),
    ),
  );
  const trackingNoByShipmentId = new Map<string, string | null>();

  if (shipmentRecordIds.length > 0) {
    const { data: shipmentData, error: shipmentError } = await supabase
      .from("shipment_records")
      .select("id, tracking_no")
      .in("id", shipmentRecordIds);

    if (shipmentError) {
      return { data: [], success: false, total: 0 };
    }

    ((shipmentData ?? []) as ShipmentTrackingRow[]).forEach((item) => {
      trackingNoByShipmentId.set(item.id, item.tracking_no);
    });
  }

  return {
    data: records.map((item) => ({
      ...item,
      tracking_no: item.shipment_record_id
        ? (trackingNoByShipmentId.get(item.shipment_record_id) ?? null)
        : null,
    })),
    success: true,
    total: count ?? 0,
  };
}

export async function requestDamageValueSummary(params: DamageRequestParams) {
  const filterState = await resolveDamageFilterState(params);
  if (filterState.matchedShipmentIds?.length === 0) {
    return { productValue: 0, freightValue: 0, totalValue: 0 };
  }

  let from = 0;
  let totalCount: number | null = null;
  let productValue = 0;
  let freightValue = 0;
  let totalValue = 0;

  while (totalCount === null || from < totalCount) {
    let query = supabase
      .from("damage_records")
      .select("product_value, freight_value, total_value", { count: "exact" })
      .range(from, from + DAMAGE_SUMMARY_PAGE_SIZE - 1);

    if (filterState.deliveryShipmentNos.length > 0) {
      query = query.in(
        "delivery_shipment_no",
        filterState.deliveryShipmentNos,
      );
    }

    if (filterState.productNames.length > 0) {
      query = query.in("product_name", filterState.productNames);
    }

    if (filterState.deliveryStores.length > 0) {
      query = query.in("delivery_store", filterState.deliveryStores);
    }

    if (filterState.matchedShipmentIds) {
      query = query.in("shipment_record_id", filterState.matchedShipmentIds);
    }

    const deliveryDate = params.delivery_date;
    if (Array.isArray(deliveryDate)) {
      const [start, end] = deliveryDate;
      if (typeof start === "string" && start) {
        query = query.gte("delivery_date", start);
      }
      if (typeof end === "string" && end) {
        query = query.lte("delivery_date", end);
      }
    }

    query = query.order("id", { ascending: true });

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = data ?? [];
    totalCount = count ?? rows.length;
    rows.forEach((item) => {
      const nextProductValue = Number(item.product_value);
      const nextFreightValue = Number(item.freight_value);
      const nextTotalValue = Number(item.total_value);

      if (Number.isFinite(nextProductValue)) productValue += nextProductValue;
      if (Number.isFinite(nextFreightValue)) freightValue += nextFreightValue;
      if (Number.isFinite(nextTotalValue)) totalValue += nextTotalValue;
    });

    if (rows.length === 0) break;
    from += rows.length;
  }

  return {
    productValue: Number(productValue.toFixed(2)),
    freightValue: Number(freightValue.toFixed(2)),
    totalValue: Number(totalValue.toFixed(2)),
  };
}

export async function requestDamageShipmentOptions() {
  const response = await fetch("/api/damages/shipment-options", {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | { data?: DamageShipmentOption[]; error?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error || "货损货件数据获取失败");
  }

  return payload?.data ?? [];
}

export async function createDamageRecord(values: DamageCreateValues) {
  const payload = {
    shipment_record_id: values.shipment_record_id,
    delivery_shipment_no: values.delivery_shipment_no.trim(),
    product_name: values.product_name.trim(),
    delivery_store: values.delivery_store.trim(),
    delivery_date: values.delivery_date,
    product_count: values.product_count,
    damage_count: values.damage_count,
    freight_unit_price: values.freight_unit_price,
    product_unit_price: values.product_unit_price,
  };

  const { data, error } = await supabase
    .from("damage_records")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return data as DamageRecord;
}
