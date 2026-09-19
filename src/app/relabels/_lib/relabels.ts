import dayjs from "dayjs";

export type RelabelRecord = {
  id: string;
  original_shipment_no: string | null;
  product_name?: string | null;
  original_ml_code?: string | null;
  new_ml_code?: string | null;
  tracking_no?: string | null;
  original_store?: string | null;
  delivery_store: string | null;
  delivery_shipment_no: string | null;
  box_count: number | null;
  product_count: number | null;
  relabel_fee: number | null;
  relabel_type: string | null;
  instruction_submitted: string | null;
  delivery_status: string | null;
  delivery_time: string | null;
  remark: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type RelabelCreateValues = {
  original_shipment_no: string;
  new_ml_code?: string | null;
  delivery_store?: string | null;
  delivery_shipment_no?: string | null;
  box_count?: number | null;
  product_count?: number | null;
  relabel_fee?: number | null;
  relabel_type?: string | null;
  instruction_submitted?: string | null;
  delivery_status?: string | null;
  delivery_time?: string | null;
  remark?: string | null;
};

export type RelabelUpdateValues = RelabelCreateValues;

export const relabelTypeOptions = [
  "外箱标",
  "外箱标及产品标",
] as const;

export function requiresProductRelabel(relabelType?: string | null) {
  return relabelType === "产品标" || relabelType === "外箱标及产品标";
}

export function normalizeNewMlCode(values: RelabelCreateValues) {
  if (!requiresProductRelabel(values.relabel_type)) return null;

  const newMlCode = values.new_ml_code?.trim();
  if (!newMlCode) throw new Error("请输入新ML Code");
  return newMlCode;
}

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

export function hasRelabelDeliveryDateArrived(record: RelabelRecord) {
  if (!record.delivery_time) return false;

  const today = dayjs().startOf("day");
  const deliveryDate = dayjs(record.delivery_time).startOf("day");

  return deliveryDate.isValid() && deliveryDate.diff(today, "day") <= 0;
}

export function canEditRelabelDeliveryStatus(record: RelabelRecord) {
  return record.delivery_status !== "是" && hasRelabelDeliveryDateArrived(record);
}

export function isRelabelDeliveryOverdue(record: RelabelRecord) {
  if (record.delivery_status === "是") return false;
  if (!record.delivery_time) return false;

  const today = dayjs().startOf("day");
  const deliveryDate = dayjs(record.delivery_time).startOf("day");

  return deliveryDate.isBefore(today, "day");
}
