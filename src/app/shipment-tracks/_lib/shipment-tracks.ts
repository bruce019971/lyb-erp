export type ShipmentTrackEvent = {
  time: string | null;
  content: string;
};

export type ShipmentTrackRecord = {
  id: string;
  shipment_record_id: string;
  shipment_no: string | null;
  tracking_no: string | null;
  logistics_provider: string | null;
  product_name: string | null;
  total_qty: number | null;
  order_store: string | null;
  delivery_status: string | null;
  latest_track: string | null;
  track_events: ShipmentTrackEvent[];
  sailing_time: string | null;
  warehouse_arrived_time: string | null;
  estimated_duration_days: number | null;
  estimated_warehouse_arrived_time: string | null;
  estimated_delivery_time: string | null;
  duration_days: number | null;
  track_updated_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ShipmentTrackEditableField =
  | "sailing_time"
  | "warehouse_arrived_time"
  | "estimated_duration_days"
  | "estimated_delivery_time";

export function isValidEstimatedDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2147483647;
}

export function calculateEstimatedWarehouseArrival(
  sailingTime: string | null,
  durationDays: number | null,
) {
  if (!sailingTime || !isValidEstimatedDuration(durationDays)) return null;
  const date = new Date(`${sailingTime.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + durationDays);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 9999) return null;
  return date.toISOString().slice(0, 10);
}

export function canEditEstimatedDelivery(
  record: Pick<ShipmentTrackRecord, "latest_track" | "warehouse_arrived_time" | "estimated_warehouse_arrived_time">,
) {
  return record.latest_track?.trim() === "清关中" &&
    !record.warehouse_arrived_time && Boolean(record.estimated_warehouse_arrived_time);
}

export function isValidEstimatedDeliveryDate(arrival: string | null, delivery: string) {
  if (!arrival) return false;
  const days = calculateShipmentTrackDurationDays(arrival, delivery);
  return days !== null && days >= 2;
}

export function formatShipmentTrackDate(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

export function formatShipmentTrackDateTime(value?: string | null) {
  if (!value) return "";
  return value.replace("T", " ").slice(0, 19);
}

export function isShipmentTrackNoiseText(value?: string | null) {
  const text = value?.trim() || "";
  if (!text) return false;

  if (
    (/^[\[{]/.test(text) || text.includes('{"') || text.includes('","')) &&
    /"[A-Za-z0-9_]+":/.test(text)
  ) {
    return true;
  }

  const fieldLikeMatches = text.match(/"[A-Za-z0-9_]+":/g) ?? [];
  if (fieldLikeMatches.length >= 4) {
    return true;
  }

  const suspiciousKeywords = [
    "clientModel",
    "amount",
    "createTime",
    "creatorName",
    "currency",
    "companyAddress",
    "totalAvailableAmount",
    "convertedAmount",
    "principal",
    "warehouseAddress",
  ];

  const matchedKeywordCount = suspiciousKeywords.filter((keyword) =>
    text.includes(keyword),
  ).length;

  return matchedKeywordCount >= 3;
}

export function sanitizeShipmentTrackText(value?: string | null) {
  const text = value?.replace(/\s+/g, " ").trim() || "";
  if (!text) return "";
  if (isShipmentTrackNoiseText(text)) return "";

  return text;
}

export function calculateShipmentTrackDurationDays(
  sailingTime?: string | null,
  warehouseArrivedTime?: string | null,
) {
  if (!sailingTime || !warehouseArrivedTime) return null;

  const sailingDate = sailingTime.slice(0, 10);
  const warehouseArrivedDate = warehouseArrivedTime.slice(0, 10);
  const sailingTimestamp = Date.parse(`${sailingDate}T00:00:00Z`);
  const warehouseArrivedTimestamp = Date.parse(
    `${warehouseArrivedDate}T00:00:00Z`,
  );

  if (
    Number.isNaN(sailingTimestamp) ||
    Number.isNaN(warehouseArrivedTimestamp)
  ) {
    return null;
  }

  return Math.round(
    (warehouseArrivedTimestamp - sailingTimestamp) / 86400000,
  );
}
