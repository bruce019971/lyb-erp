import dayjs from "dayjs";

export type ShipmentRecord = {
  id: string;
  order_store: string | null;
  logistics_provider: string | null;
  shipment_no: string | null;
  tracking_no: string | null;
  carton_label_url: string | null;
  logistics_box_mark_url: string | null;
  product_name: string | null;
  box_count: number | null;
  pcs_per_box: number | null;
  total_qty: number | null;
  warehouse_arrived_status: string | null;
  overseas_warehouse_arrived_at: string | null;
  appointment_time: string | null;
  delivery_status: string | null;
  is_relabel: string | null;
  relabel_delivery_times?: string[];
  goods_value: number | null;
  is_delivery_completed?: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type ShipmentUpdateValues = {
  order_store?: string | null;
  logistics_provider?: string | null;
  shipment_no?: string | null;
  tracking_no?: string | null;
  carton_label_url?: string | null;
  logistics_box_mark_url?: string | null;
  product_name?: string | null;
  box_count?: number | null;
  pcs_per_box?: number | null;
  total_qty?: number | null;
  warehouse_arrived_status?: string | null;
  overseas_warehouse_arrived_at?: string | null;
  appointment_time?: string | null;
  delivery_status?: string | null;
  is_relabel?: string | null;
  goods_value?: number | null;
};

export type ShipmentCreateValues = ShipmentUpdateValues;

export type ShipmentOption = {
  id: string;
  shipment_no: string | null;
  order_store: string | null;
  box_count: number | null;
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

export function canEditShipmentDeliveryStatus(record: ShipmentRecord) {
  if (record.delivery_status === "是") return true;

  const deliveryTimes =
    record.is_relabel === "是" && record.relabel_delivery_times?.length
      ? record.relabel_delivery_times
      : record.appointment_time
        ? [record.appointment_time]
        : [];

  if (!deliveryTimes.length) return false;

  const today = dayjs().startOf("day");

  return deliveryTimes.some((value) => {
    const deliveryDate = dayjs(value).startOf("day");
    return deliveryDate.diff(today, "day") <= 0;
  });
}

export function isShipmentDeliveryOverdue(record: ShipmentRecord) {
  if (record.delivery_status === "是") return false;

  const deliveryTimes =
    record.is_relabel === "是" && record.relabel_delivery_times?.length
      ? record.relabel_delivery_times
      : record.appointment_time
        ? [record.appointment_time]
        : [];

  if (!deliveryTimes.length) return false;

  const today = dayjs().startOf("day");

  return deliveryTimes.some((value) => {
    const deliveryDate = dayjs(value).startOf("day");
    return deliveryDate.diff(today, "day") <= 0;
  });
}
