import { supabase } from "@/lib/supabase";
import { calculateShipmentTrackDurationDays } from "../../shipment-tracks/_lib/shipment-tracks";

import type { RelabelFeeContext } from "./relabel-fee";

export async function requestRelabelFeeContexts(shipmentNos: string[]) {
  const contexts = new Map<string, RelabelFeeContext>();
  const uniqueNos = [...new Set(shipmentNos.map((value) => value.trim()).filter(Boolean))];
  if (!uniqueNos.length) return contexts;

  const shipments: {
    shipment_no: string | null;
    logistics_provider: string | null;
    shipment_tracks: {
      sailing_time: string | null;
      warehouse_arrived_time: string | null;
    } | {
      sailing_time: string | null;
      warehouse_arrived_time: string | null;
    }[] | null;
  }[] = [];
  // 限制 in 查询长度，并完整读取关联数据，避免合计被单次查询上限截断。
  for (let start = 0; start < uniqueNos.length; start += 100) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from("shipment_records")
        .select("shipment_no, logistics_provider, shipment_tracks(sailing_time, warehouse_arrived_time)")
        .eq("status", "有效")
        .in("shipment_no", uniqueNos.slice(start, start + 100))
        .order("id", { ascending: true })
        .range(offset, offset + 499);
      if (error) throw error;
      const rows = data ?? [];
      shipments.push(...rows);
      if (rows.length < 500) break;
    }
  }

  const providers = [...new Set(shipments.map((row) => row.logistics_provider).filter(
    (value): value is string => Boolean(value),
  ))];
  const prices = new Map<string, number | null>();
  for (let start = 0; start < providers.length; start += 100) {
    const { data, error } = await supabase.from("logistics_providers")
      .select("provider_name, carton_label_unit_price")
      .in("provider_name", providers.slice(start, start + 100));
    if (error) throw error;
    (data ?? []).forEach((row) => {
      prices.set(row.provider_name, row.carton_label_unit_price);
    });
  }

  shipments.forEach((row) => {
    const shipmentNo = row.shipment_no?.trim();
    if (!shipmentNo || contexts.has(shipmentNo)) return;
    const track = Array.isArray(row.shipment_tracks) ? row.shipment_tracks[0] : row.shipment_tracks;
    contexts.set(shipmentNo, {
      duration_days: calculateShipmentTrackDurationDays(track?.sailing_time, track?.warehouse_arrived_time),
      carton_label_unit_price: prices.get(row.logistics_provider ?? "") ?? null,
    });
  });
  return contexts;
}
