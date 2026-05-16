import dayjs from "dayjs";

export type RelabelRecord = {
  id: string;
  original_shipment_no: string | null;
  delivery_store: string | null;
  delivery_shipment_no: string | null;
  relabel_type: string | null;
  instruction_submitted: string | null;
  delivery_status: string | null;
  delivery_time: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type RelabelCreateValues = {
  original_shipment_no: string;
  delivery_store?: string | null;
  delivery_shipment_no?: string | null;
  relabel_type?: string | null;
  instruction_submitted?: string | null;
  delivery_status?: string | null;
  delivery_time?: string | null;
};

export type RelabelUpdateValues = RelabelCreateValues;

export const relabelTypeOptions = [
  "外箱标",
  "产品标",
  "外箱标及产品标",
] as const;

export function formatRelabelDate(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

export function isRelabelAlert(record: RelabelRecord) {
  if (record.instruction_submitted !== "否") return false;
  if (!record.delivery_time) return false;

  const today = dayjs().startOf("day");
  const deliveryDate = dayjs(record.delivery_time).startOf("day");
  const diffDays = deliveryDate.diff(today, "day");

  return diffDays >= 0 && diffDays <= 3;
}

export function canEditRelabelDeliveryStatus(record: RelabelRecord) {
  if (record.delivery_status === "是") return false;
  if (!record.delivery_time) return false;

  const today = dayjs().startOf("day");
  const deliveryDate = dayjs(record.delivery_time).startOf("day");

  return deliveryDate.diff(today, "day") <= 0;
}
