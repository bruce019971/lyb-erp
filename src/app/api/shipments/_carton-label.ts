import type { SupabaseClient } from "@supabase/supabase-js";
import { generateShipmentLabels } from "@/lib/shipment-label";

type CartonLabelInput = {
  shipmentNo: string;
  boxCount: string;
  storeId: string;
  storeAlias: string;
  storeType?: string | null;
};

export function safeCartonLabelFilePart(value?: string | null) {
  return value?.trim().replace(/[\\/:*?"<>|]+/g, "_") || "";
}

export async function fetchShipmentCartonLabel({
  shipmentNo,
  boxCount,
  storeId,
  storeAlias,
  storeType,
}: CartonLabelInput) {
  const isLocalStore = storeType?.trim() === "本土";

  const result = await generateShipmentLabels({
    status: { isId: true, isNew: isLocalStore },
    data: {
      id: shipmentNo,
      warehouseNumber: isLocalStore ? "MXRC03" : "",
      warehouseName: isLocalStore
        ? "Centro logístico Danhos Cuautitlán - MXRC03"
        : "",
      nb: boxCount,
      shopId: storeId,
      shopName: isLocalStore ? "" : storeAlias,
    },
  });

  return {
    buffer: Uint8Array.from(result.buffer).buffer,
    contentType: result.contentType,
  };
}

export async function uploadShipmentCartonLabel(
  adminClient: SupabaseClient,
  params: CartonLabelInput & {
    shipmentId: string;
    productName?: string | null;
  },
) {
  const { buffer, contentType } = await fetchShipmentCartonLabel(params);
  const filePath = `shipment-carton-labels/${params.shipmentId}/${crypto.randomUUID()}.pdf`;

  const { error: uploadError } = await adminClient.storage
    .from("product-images")
    .upload(filePath, buffer, {
      cacheControl: "0",
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = adminClient.storage
    .from("product-images")
    .getPublicUrl(filePath);

  return data.publicUrl;
}
