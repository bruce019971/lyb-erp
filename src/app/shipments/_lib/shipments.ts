export type ShipmentRecord = {
  id: string;
  order_store: string | null;
  order_time: string | null;
  logistics_provider: string | null;
  shipment_no: string | null;
  tracking_no: string | null;
  product_name: string | null;
  box_count: number | null;
  pcs_per_box: number | null;
  total_qty: number | null;
  overseas_warehouse_arrived_at: string | null;
  new_shipment_no: string | null;
  appointment_time: string | null;
  instruction_submitted: string | null;
  first_leg_unit_cost: number | null;
  first_leg_batch_fee: number | null;
  first_leg_fee_settled: string | null;
  factory_monthly_settled: string | null;
  goods_value: number | null;
  relabel_fee_checked: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export const shipmentKeywordFields = [
  "order_store",
  "logistics_provider",
  "shipment_no",
  "tracking_no",
  "product_name",
  "new_shipment_no",
] as const satisfies ReadonlyArray<keyof ShipmentRecord>;

export const shipmentDateFields = [
  "order_time",
  "overseas_warehouse_arrived_at",
  "appointment_time",
] as const satisfies ReadonlyArray<keyof ShipmentRecord>;

export function formatShipmentDate(value?: string | null) {
  if (!value) return "-";
  return value.slice(0, 10);
}
