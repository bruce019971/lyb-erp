export type FreightRecord = {
  id: string;
  shipment_record_id: string;
  shipment_no: string | null;
  tracking_no: string | null;
  logistics_provider: string | null;
  product_name: string | null;
  order_store: string | null;
  overseas_warehouse_arrived_at: string | null;
  freight_unit_price: number | null;
  volume: number | null;
  extra_fee: number | null;
  extra_fee_remark: string | null;
  box_count: number | null;
  total_qty: number | null;
  total_fee: number | null;
  bill_amount: number | null;
  unit_fee: number | null;
  freight_paid_status: string | null;
  saleasy_plan_status: number | null;
  saleasy_transport_plan_id: string | null;
  saleasy_total_amount: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type FreightUpdateValues = {
  freight_unit_price?: number | null;
  volume?: number | null;
  extra_fee?: number | null;
  total_fee?: number | null;
  freight_paid_status?: string | null;
};

export type FreightSummary = {
  volume: number;
  total_fee: number;
  bill_amount: number;
};

export function calculateFreightTotalFee(values: {
  freight_unit_price?: number | null;
  volume?: number | null;
  extra_fee?: number | null;
}) {
  const freightUnitPrice = values.freight_unit_price;
  const volume = values.volume;
  const extraFee = values.extra_fee;

  if (
    typeof freightUnitPrice !== "number" ||
    !Number.isFinite(freightUnitPrice) ||
    typeof volume !== "number" ||
    !Number.isFinite(volume)
  ) {
    return null;
  }

  const normalizedExtraFee =
    typeof extraFee === "number" && Number.isFinite(extraFee) ? extraFee : 0;

  return Number((freightUnitPrice * volume + normalizedExtraFee).toFixed(2));
}

export function calculateFreightUnitFee(
  totalFee?: number | null,
  totalQty?: number | null,
) {
  if (
    typeof totalFee !== "number" ||
    !Number.isFinite(totalFee) ||
    typeof totalQty !== "number" ||
    !Number.isFinite(totalQty) ||
    totalQty <= 0
  ) {
    return null;
  }

  return Number((totalFee / totalQty).toFixed(2));
}
