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
