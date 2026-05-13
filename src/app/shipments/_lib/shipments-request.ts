import type { SortOrder } from "antd/es/table/interface";
import { message } from "antd";

import { supabase } from "@/lib/supabase";

import {
  shipmentDateFields,
  shipmentKeywordFields,
  type ShipmentRecord,
} from "./shipments";

type ShipmentRequestParams = {
  current?: number;
  pageSize?: number;
  keyword?: string;
} & Record<string, unknown>;

export async function requestShipmentRecords(
  params: ShipmentRequestParams,
  sorter: Record<string, SortOrder>,
) {
  const current = params.current ?? 1;
  const pageSize = params.pageSize ?? 20;
  const from = (current - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("shipment_records")
    .select("*", { count: "exact" })
    .range(from, to);

  shipmentKeywordFields.forEach((field) => {
    const value = params[field];
    if (typeof value === "string" && value.trim()) {
      query = query.ilike(field, `%${value.trim()}%`);
    }
  });

  shipmentDateFields.forEach((field) => {
    const value = params[field];
    if (Array.isArray(value)) {
      const [start, end] = value;
      if (start) query = query.gte(field, start);
      if (end) query = query.lte(field, end);
    }
  });

  const orderField = Object.keys(sorter ?? {})[0];
  const orderDirection = orderField ? sorter[orderField] : undefined;

  if (orderField && orderDirection) {
    query = query.order(orderField, {
      ascending: orderDirection === "ascend",
    });
  } else {
    query = query.order("order_time", {
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

  return {
    data: (data ?? []) as ShipmentRecord[],
    success: true,
    total: count ?? 0,
  };
}
