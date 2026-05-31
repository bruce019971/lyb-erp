import type { SupabaseClient } from "@supabase/supabase-js";

type SyncShipmentWarehouseArrivedAtParams = {
  adminClient: SupabaseClient;
  shipmentRecordId?: string | null;
  previousWarehouseArrivedTime?: string | null;
  nextWarehouseArrivedTime?: string | null;
};

function normalizeWarehouseArrivedTime(value?: string | null) {
  const text = value?.trim();
  return text || null;
}

export async function syncShipmentWarehouseArrivedAt({
  adminClient,
  shipmentRecordId,
  previousWarehouseArrivedTime,
  nextWarehouseArrivedTime,
}: SyncShipmentWarehouseArrivedAtParams) {
  const nextValue = normalizeWarehouseArrivedTime(nextWarehouseArrivedTime);
  const previousValue = normalizeWarehouseArrivedTime(previousWarehouseArrivedTime);

  if (!shipmentRecordId || !nextValue || nextValue === previousValue) {
    return;
  }

  const { error } = await adminClient
    .from("shipment_records")
    .update({
      overseas_warehouse_arrived_at: nextValue,
      warehouse_arrived_status: "是",
      updated_at: new Date().toISOString(),
    })
    .eq("id", shipmentRecordId);

  if (error) {
    throw error;
  }
}
