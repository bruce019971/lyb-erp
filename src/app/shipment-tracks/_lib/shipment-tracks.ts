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
  latest_track: string | null;
  track_events: ShipmentTrackEvent[];
  sailing_time: string | null;
  warehouse_arrived_time: string | null;
  duration_days: number | null;
  track_updated_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

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
