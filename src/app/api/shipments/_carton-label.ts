import type { SupabaseClient } from "@supabase/supabase-js";

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

  const response = await fetch(
    "https://melinet.cn/api/download-shipment-label",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        status: {
          isId: true,
          isNew: isLocalStore ? true : false,
        },
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
      }),
    },
  );

  const contentType = response.headers.get("content-type") ?? "application/pdf";

  if (!response.ok) {
    let message = "外箱标签下载失败";
    if (contentType.includes("application/json")) {
      const result = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      message = result?.error || result?.message || message;
    } else {
      const text = await response.text().catch(() => "");
      message = text.trim() || message;
    }

    throw new Error(message);
  }

  return {
    buffer: await response.arrayBuffer(),
    contentType,
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
