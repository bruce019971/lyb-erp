import type { SortOrder } from "antd/es/table/interface";

import { supabase } from "@/lib/supabase";

import {
  calculateFreightTotalFee,
  calculateFreightUnitFee,
  type FreightRecord,
  type FreightUpdateValues,
} from "./freights";

type FreightRequestParams = {
  current?: number;
  pageSize?: number;
} & Record<string, unknown>;

export async function requestFreightRecords(
  params: FreightRequestParams,
  sorter: Record<string, SortOrder>,
) {
  const current = params.current ?? 1;
  const pageSize = params.pageSize ?? 20;
  const from = (current - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("shipment_records")
    .select(
      "id, shipment_no, logistics_provider, product_name, freight_unit_price, volume, total_qty, freight_paid_status, created_at, updated_at",
      { count: "exact" },
    )
    .range(from, to);

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

  const records = ((data ?? []) as Array<
    Omit<FreightRecord, "total_fee" | "unit_fee">
  >).map((record) => {
    const totalFee = calculateFreightTotalFee(
      record.freight_unit_price,
      record.volume,
    );
    const unitFee = calculateFreightUnitFee(totalFee, record.total_qty);

    return {
      ...record,
      total_fee: totalFee,
      unit_fee: unitFee,
      freight_paid_status: record.freight_paid_status ?? "否",
    };
  });

  return {
    data: records,
    success: true,
    total: count ?? 0,
  };
}

function normalizeNumberValue(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeTextValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function updateFreightRecord(
  id: string,
  record: Pick<FreightRecord, "total_qty">,
  values: FreightUpdateValues,
) {
  const freightUnitPrice = normalizeNumberValue(values.freight_unit_price);
  const volume = normalizeNumberValue(values.volume);
  const totalFee = calculateFreightTotalFee(freightUnitPrice, volume);
  const unitFee = calculateFreightUnitFee(totalFee, record.total_qty);

  const payload = {
    freight_unit_price: freightUnitPrice,
    volume,
    first_leg_batch_fee: totalFee,
    first_leg_unit_cost: unitFee,
    freight_paid_status: normalizeTextValue(values.freight_paid_status) ?? "否",
  };

  const { data, error } = await supabase
    .from("shipment_records")
    .update(payload)
    .eq("id", id)
    .select(
      "id, shipment_no, logistics_provider, product_name, freight_unit_price, volume, total_qty, freight_paid_status, created_at, updated_at",
    )
    .single();

  if (error) {
    throw error;
  }

  const next = data as Omit<FreightRecord, "total_fee" | "unit_fee">;
  return {
    ...next,
    total_fee: calculateFreightTotalFee(next.freight_unit_price, next.volume),
    unit_fee: calculateFreightUnitFee(
      calculateFreightTotalFee(next.freight_unit_price, next.volume),
      next.total_qty,
    ),
  } as FreightRecord;
}
