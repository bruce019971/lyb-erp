import dayjs from "dayjs";

export type ShipmentRecord = {
  id: string;
  order_store: string | null;
  logistics_provider: string | null;
  shipment_no: string | null;
  tracking_no: string | null;
  carton_label_url: string | null;
  logistics_box_mark_url: string | null;
  order_invoice_url: string | null;
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
  status: string | null;
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

export type ShipmentDateField =
  | "overseas_warehouse_arrived_at"
  | "appointment_time";

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

export function isShipmentDelivered(
  record: Partial<Pick<ShipmentRecord, "delivery_status">> &
    Partial<Pick<ShipmentRecord, "is_delivery_completed">>,
) {
  return record.is_delivery_completed === true || record.delivery_status === "是";
}

export function isShipmentLocked(
  record: Partial<
    Pick<
      ShipmentRecord,
      | "delivery_status"
      | "is_delivery_completed"
      | "warehouse_arrived_status"
      | "overseas_warehouse_arrived_at"
    >
  >,
) {
  return (
    isShipmentDelivered(record) ||
    record.warehouse_arrived_status === "是" ||
    Boolean(record.overseas_warehouse_arrived_at)
  );
}

export function isShipmentWarehouseArrived(
  record: Partial<
    Pick<
      ShipmentRecord,
      "warehouse_arrived_status" | "overseas_warehouse_arrived_at"
    >
  >,
) {
  return (
    record.warehouse_arrived_status === "是" ||
    Boolean(record.overseas_warehouse_arrived_at)
  );
}

export function isShipmentWarehousePendingDelivery(
  record: Partial<
    Pick<
      ShipmentRecord,
      | "delivery_status"
      | "is_delivery_completed"
      | "warehouse_arrived_status"
      | "overseas_warehouse_arrived_at"
    >
  >,
) {
  return isShipmentWarehouseArrived(record) && !isShipmentDelivered(record);
}

export function getShipmentListStatusRank(
  record: Partial<
    Pick<
      ShipmentRecord,
      | "delivery_status"
      | "is_delivery_completed"
      | "warehouse_arrived_status"
      | "overseas_warehouse_arrived_at"
    >
  >,
) {
  if (isShipmentDelivered(record)) return 2;
  if (isShipmentWarehousePendingDelivery(record)) return 1;
  return 0;
}

export function canEditShipmentDateField(
  record: Partial<
    Pick<
      ShipmentRecord,
      | "delivery_status"
      | "is_delivery_completed"
      | "warehouse_arrived_status"
      | "overseas_warehouse_arrived_at"
      | "is_relabel"
    >
  >,
  field: ShipmentDateField,
) {
  if (isShipmentWarehouseArrived(record) || isShipmentDelivered(record)) {
    return false;
  }

  return field !== "appointment_time" || record.is_relabel !== "是";
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
    return deliveryDate.diff(today, "day") < 0;
  });
}
