import type { ShipmentRecord } from "./shipments";
import type { StoreOption } from "../../stores/_lib/stores";

function safeFilePart(value?: string | null) {
  return value?.trim().replace(/[\\/:*?"<>|]+/g, "_") || "";
}

export function getShipmentCartonLabelFileName(record: ShipmentRecord) {
  const productName = record.product_name?.trim();
  if (!productName) {
    throw new Error("当前货件缺少产品名称");
  }

  const shipmentNo = record.shipment_no?.trim();
  if (!shipmentNo) {
    throw new Error("当前货件缺少货件号");
  }

  const boxCount =
    typeof record.box_count === "number" && Number.isFinite(record.box_count)
      ? String(record.box_count)
      : "";
  if (!boxCount) {
    throw new Error("当前货件缺少箱数");
  }

  return `${safeFilePart(productName)}外箱标签-${safeFilePart(
    shipmentNo,
  )}(${boxCount}).pdf`;
}

export async function downloadShipmentCartonLabel(
  record: ShipmentRecord,
  storeOptions: StoreOption[],
) {
  const fileName = getShipmentCartonLabelFileName(record);

  const storeName = record.order_store?.trim();
  const store = storeName
    ? storeOptions.find((item) => item.seller_name?.trim() === storeName)
    : undefined;
  const storeAlias = store?.seller_alias?.trim();
  const storeId = store?.seller_id?.trim();

  if (!storeAlias || !storeId) {
    throw new Error("当前货件缺少店铺别名或店铺ID");
  }

  const shipmentNo = record.shipment_no!.trim();
  const boxCount = String(record.box_count);

  const response = await fetch("/api/shipments/carton-label", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      shipmentNo,
      boxCount,
      storeId,
      storeAlias,
    }),
  });

  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(result?.error || "外箱标签下载失败");
  }

  const labelBlob = await response.blob();
  const objectUrl = window.URL.createObjectURL(labelBlob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}
