export type FreightRecord = {
  id: string;
  shipment_record_id: string;
  shipment_no: string | null;
  tracking_no: string | null;
  logistics_provider: string | null;
  product_name: string | null;
  freight_unit_price: number | null;
  volume: number | null;
  extra_fee: number | null;
  box_count: number | null;
  total_qty: number | null;
  total_fee: number | null;
  bill_amount: number | null;
  unit_fee: number | null;
  freight_paid_status: string | null;
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
