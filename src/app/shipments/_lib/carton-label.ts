import type { ShipmentRecord } from "./shipments";
import type { StoreOption } from "../../stores/_lib/stores";

type ShipmentFileNameRecord = {
  order_store?: string | null;
  shipment_no?: string | null;
  product_name?: string | null;
  box_count?: number | null;
};

function safeFilePart(value?: string | null) {
  return value?.trim().replace(/[\\/:*?"<>|]+/g, "_") || "";
}

export function getShipmentCartonLabelFileName(record: ShipmentRecord) {
  const productName = record.product_name?.trim() || "货件";
  const shipmentNo = record.shipment_no?.trim() || "未命名";

  const boxCount =
    typeof record.box_count === "number" && Number.isFinite(record.box_count)
      ? String(record.box_count)
      : "";
  const boxCountSuffix = boxCount ? `(${boxCount})` : "";

  return `${safeFilePart(productName)}外箱标签-${safeFilePart(
    shipmentNo,
  )}${boxCountSuffix}.pdf`;
}

function getShipmentStoreCode(
  record: ShipmentFileNameRecord,
  storeOptions: StoreOption[],
) {
  const storeName = record.order_store?.trim();
  const store = storeName
    ? storeOptions.find((item) => item.seller_name?.trim() === storeName)
    : undefined;

  return safeFilePart(store?.seller_code) || "StoreCode";
}

export function getShipmentCartonLabelDownloadFileName(
  record: ShipmentRecord,
  storeOptions: StoreOption[],
) {
  const productName = safeFilePart(record.product_name) || "货件";
  const shipmentNo = safeFilePart(record.shipment_no) || "未命名";
  const boxCount =
    typeof record.box_count === "number" && Number.isFinite(record.box_count)
      ? String(record.box_count)
      : "";
  const storeCode = getShipmentStoreCode(record, storeOptions);

  return `${productName}外箱标签_${shipmentNo}(${boxCount})_${storeCode}.pdf`;
}

export async function downloadShipmentCartonLabel(
  record: ShipmentRecord,
  storeOptions: StoreOption[],
) {
  const fileName = getShipmentCartonLabelDownloadFileName(record, storeOptions);
  const cartonLabelUrl = record.carton_label_url?.trim();
  if (!cartonLabelUrl) {
    throw new Error("当前货件未生成外箱标签");
  }

  const proxyUrl = `/api/proxy-download?${new URLSearchParams({
    url: cartonLabelUrl,
    filename: fileName,
    t: String(Date.now()),
  })}`;
  const response = await fetch(proxyUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("外箱标签文件读取失败");
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

function getUrlSuffix(url: string) {
  return url.split(".").pop()?.split("?")[0]?.split("#")[0] ?? "";
}

export function getShipmentLogisticsBoxMarkFileName(
  record: ShipmentFileNameRecord,
  storeOptions: StoreOption[],
) {
  const productName = safeFilePart(record.product_name) || "货件";
  const shipmentNo = safeFilePart(record.shipment_no) || "未命名";
  const boxCount =
    typeof record.box_count === "number" && Number.isFinite(record.box_count)
      ? String(record.box_count)
      : "";
  const storeCode = getShipmentStoreCode(record, storeOptions);

  return `${productName}物流箱唛_${shipmentNo}(${boxCount})_${storeCode}`;
}

export async function downloadShipmentLogisticsBoxMark(
  record: ShipmentRecord,
  storeOptions: StoreOption[],
) {
  const url = record.logistics_box_mark_url?.trim();
  if (!url) {
    throw new Error("当前货件未填写物流箱唛 URL");
  }

  const suffix = getUrlSuffix(url) || "pdf";
  const filenameBase = getShipmentLogisticsBoxMarkFileName(record, storeOptions);
  const fileName = suffix ? `${filenameBase}.${suffix}` : filenameBase;
  const proxyUrl = `/api/proxy-download?${new URLSearchParams({
    url,
    filename: fileName,
  })}`;
  const response = await fetch(proxyUrl);
  if (!response.ok) {
    throw new Error("物流箱唛文件读取失败");
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}
