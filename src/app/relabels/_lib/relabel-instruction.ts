import ExcelJS from "exceljs";

import type { RelabelRecord } from "./relabels";

type RelabelInstructionRecord = Pick<
  RelabelRecord,
  | "relabel_type"
  | "tracking_no"
  | "original_shipment_no"
  | "delivery_shipment_no"
  | "box_count"
  | "original_ml_code"
  | "new_ml_code"
  | "product_count"
>;

function requireText(value: string | null | undefined, label: string) {
  const text = value?.trim();
  if (!text) throw new Error(`缺少${label}，请补齐后下载换标指令`);
  return text;
}

function safeFileNamePart(value: string) {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
}

export async function createRelabelInstruction(
  record: RelabelInstructionRecord,
  template: ArrayBuffer,
) {
  const includesProductLabel = record.relabel_type === "外箱标及产品标";
  if (record.relabel_type !== "外箱标" && !includesProductLabel) {
    throw new Error("目前仅支持外箱标、外箱标及产品标类型的换标指令下载");
  }

  const trackingNo = requireText(record.tracking_no, "原货件的运单编号");
  const originalShipmentNo = requireText(record.original_shipment_no, "原货件号");
  const deliveryShipmentNo = requireText(record.delivery_shipment_no, "送仓货件号");
  const boxCount = record.box_count;
  if (boxCount === null || !Number.isInteger(boxCount) || boxCount <= 0) {
    throw new Error("请填写大于0的整数箱数后下载换标指令");
  }

  const originalMlCode = includesProductLabel
    ? requireText(record.original_ml_code, "原货件产品ML Code")
    : null;
  const newMlCode = includesProductLabel
    ? requireText(record.new_ml_code, "新ML Code")
    : null;
  const productCount = record.product_count;
  if (
    includesProductLabel &&
    (productCount === null || !Number.isInteger(productCount) || productCount <= 0)
  ) {
    throw new Error("请填写大于0的整数产品数后下载换标指令");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template);
  const worksheet = workbook.getWorksheet("Sheet1");
  if (!worksheet) throw new Error("换标指令模板缺少Sheet1工作表");

  worksheet.getCell("A3").value = trackingNo;
  worksheet.getCell("C3").value = originalShipmentNo;
  worksheet.getCell("D3").value = deliveryShipmentNo;
  worksheet.getCell("G3").value = boxCount;

  if (includesProductLabel) {
    worksheet.getCell("E3").value = originalMlCode;
    worksheet.getCell("F3").value = newMlCode;
    worksheet.getCell("H3").value = productCount;
  }

  return {
    buffer: await workbook.xlsx.writeBuffer(),
    fileName: `RSH-${safeFileNamePart(originalShipmentNo)}换${safeFileNamePart(deliveryShipmentNo)}-换标指令.xlsx`,
  };
}
