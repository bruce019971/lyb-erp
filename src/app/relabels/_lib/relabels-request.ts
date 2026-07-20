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
      .order("created_at", {
        ascending: false,
        nullsFirst: false,
      })
      .order("id", { ascending: false });
  }

  const { data, error, count } = await query;

  if (error) {
    return {
      data: [],
      success: false,
      total: 0,
    };
  }

  const relabelRecords = (data ?? []) as RelabelRecord[];
  const relabelOriginalShipmentNos = Array.from(
    new Set(
      relabelRecords
        .map((item) => item.original_shipment_no?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  );
  const productNameByShipmentNo = new Map<string, string | null>();
  const originalStoreByShipmentNo = new Map<string, string | null>();

  if (relabelOriginalShipmentNos.length > 0) {
    const { data: shipmentRows } = await supabase
      .from("shipment_records")
      .select("shipment_no, product_name, order_store")
      .eq("status", "有效")
      .in("shipment_no", relabelOriginalShipmentNos);

    (shipmentRows ?? []).forEach((item) => {
      const shipmentNo =
        typeof item.shipment_no === "string" ? item.shipment_no.trim() : "";
      if (!shipmentNo || productNameByShipmentNo.has(shipmentNo)) return;

      productNameByShipmentNo.set(
        shipmentNo,
        typeof item.product_name === "string" ? item.product_name : null,
      );
      originalStoreByShipmentNo.set(
        shipmentNo,
        typeof item.order_store === "string" ? item.order_store : null,
      );
    });
  }

  return {
    data: relabelRecords.map((item) => {
      const shipmentNo = item.original_shipment_no?.trim();

      return {
        ...item,
        product_name: shipmentNo
          ? (productNameByShipmentNo.get(shipmentNo) ?? null)
          : null,
        original_store: shipmentNo
          ? (originalStoreByShipmentNo.get(shipmentNo) ?? null)
          : null,
      };
    }),
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

async function syncOriginalShipmentAppointmentTime(record: RelabelRecord) {
  const originalShipmentNo = record.original_shipment_no?.trim();
  if (!originalShipmentNo) return;

  const { error } = await supabase
    .from("shipment_records")
    .update({
      appointment_time: normalizeTextValue(record.delivery_time),
      updated_at: new Date().toISOString(),
    })
    .eq("shipment_no", originalShipmentNo)
    .eq("status", "有效");

  if (error) {
    throw error;
  }
}

async function syncOriginalShipmentDeliveryStatus(record: RelabelRecord) {
  const originalShipmentNo = record.original_shipment_no?.trim();
  if (!originalShipmentNo) return;

  const { error } = await supabase
    .from("shipment_records")
    .update({
      delivery_status: normalizeTextValue(record.delivery_status) ?? "否",
      updated_at: new Date().toISOString(),
    })
    .eq("shipment_no", originalShipmentNo)
    .eq("status", "有效");

  if (error) {
    throw error;
  }
}

async function markOriginalShipmentAsRelabel(record: RelabelRecord) {
  const originalShipmentNo = record.original_shipment_no?.trim();
  if (!originalShipmentNo) return;

  const { error } = await supabase
    .from("shipment_records")
    .update({
      is_relabel: "是",
      updated_at: new Date().toISOString(),
    })
    .eq("shipment_no", originalShipmentNo)
    .eq("status", "有效");

  if (error) {
    throw error;
  }
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
    remark: normalizeTextValue(values.remark),
  };

  const { data, error } = await supabase
    .from("relabel_records")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const relabelRecord = data as RelabelRecord;
  await markOriginalShipmentAsRelabel(relabelRecord);
  await syncOriginalShipmentAppointmentTime(relabelRecord);

  return relabelRecord;
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
    remark: normalizeTextValue(values.remark),
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

  const relabelRecord = data as RelabelRecord;
  await syncOriginalShipmentAppointmentTime(relabelRecord);
  if (values.delivery_status !== undefined) {
    await syncOriginalShipmentDeliveryStatus(relabelRecord);
  }

  return relabelRecord;
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

  const relabelRecord = data as RelabelRecord;
  if (field === "delivery_status") {
    await syncOriginalShipmentDeliveryStatus(relabelRecord);
  }

  return relabelRecord;
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
