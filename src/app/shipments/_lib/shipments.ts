export type ShipmentRecord = {
  id: string;
  order_store: string | null;
  logistics_provider: string | null;
  shipment_no: string | null;
  tracking_no: string | null;
  product_name: string | null;
  box_count: number | null;
  pcs_per_box: number | null;
  total_qty: number | null;
  warehouse_arrived_status: string | null;
  overseas_warehouse_arrived_at: string | null;
  appointment_time: string | null;
  first_leg_unit_cost: number | null;
  first_leg_batch_fee: number | null;
  goods_value: number | null;
  freight_unit_price: number | null;
  volume: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ShipmentUpdateValues = {
  order_store?: string | null;
  logistics_provider?: string | null;
  shipment_no?: string | null;
  tracking_no?: string | null;
  product_name?: string | null;
  box_count?: number | null;
  pcs_per_box?: number | null;
  total_qty?: number | null;
  warehouse_arrived_status?: string | null;
  overseas_warehouse_arrived_at?: string | null;
  appointment_time?: string | null;
  first_leg_unit_cost?: number | null;
  first_leg_batch_fee?: number | null;
  goods_value?: number | null;
  freight_unit_price?: number | null;
  volume?: number | null;
};

export type ShipmentCreateValues = ShipmentUpdateValues;

export type ShipmentOption = {
  id: string;
  shipment_no: string | null;
  order_store: string | null;
};

export const shipmentKeywordFields = [
  "order_store",
  "logistics_provider",
  "shipment_no",
  "tracking_no",
  "product_name",
] as const satisfies ReadonlyArray<keyof ShipmentRecord>;

export const shipmentDateFields = [
  "created_at",
  "overseas_warehouse_arrived_at",
  "appointment_time",
] as const satisfies ReadonlyArray<keyof ShipmentRecord>;

export function formatShipmentDate(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}
