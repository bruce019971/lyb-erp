import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PDFDocument,
  StandardFonts,
  TextRenderingMode,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setLineWidth,
  setTextRenderingMode,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import QRCode from "qrcode";

export const MAX_CARTON_LABELS = 500;

/** The JSON contract used by melinet's download-shipment-label endpoint. */
export type ShipmentLabelRequest = {
  status: { isId: true; isNew: boolean };
  data: {
    id: string | number;
    nb: string | number;
    shopId: string | number;
    shopName: string;
    warehouseNumber: string;
    warehouseName: string;
  };
};

export type ShipmentLabelInput = {
  shipmentNo: string;
  boxCount: number;
  shopId: string;
  shopName: string;
  warehouseNumber: string;
  warehouseName: string;
  isLocal: boolean;
};

export class ShipmentLabelInputError extends Error {}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ShipmentLabelInputError(`${label} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function identifier(value: unknown, label: string, allowHash = false) {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) {
    throw new ShipmentLabelInputError(`${label} 必须是安全整数或数字字符串`);
  }
  let text = typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
  if (allowHash) text = text.replace(/^#/, "");
  if (!/^\d{1,32}$/.test(text)) {
    throw new ShipmentLabelInputError(`${label} 必须是 1–32 位数字`);
  }
  return text;
}

function labelText(value: unknown, label: string, required: boolean, max: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if ((required && !text) || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new ShipmentLabelInputError(`${label} 不能为空、含控制字符或超过 ${max} 字符`);
  }
  // The source labels use Helvetica / WinAnsi (including Spanish accents).
  // Reject unsupported glyphs rather than silently printing missing characters.
  if (/[^\u0020-\u007e\u00a0-\u00ff]/.test(text)) {
    throw new ShipmentLabelInputError(`${label} 请使用拉丁字母、数字及西班牙语字符`);
  }
  return text;
}

export function parseShipmentLabelRequest(value: unknown): ShipmentLabelInput {
  const body = object(value, "请求"), status = object(body.status, "status");
  const data = object(body.data, "data");
  if (status.isId !== true) {
    throw new ShipmentLabelInputError("仅支持当前货件号模式：status.isId 必须为 true");
  }
  if (typeof status.isNew !== "boolean") {
    throw new ShipmentLabelInputError("status.isNew 必须为布尔值");
  }
  const count = typeof data.nb === "string" ? data.nb.trim() : data.nb;
  if ((typeof count !== "string" && typeof count !== "number") ||
      !/^[1-9]\d*$/.test(String(count)) ||
      !Number.isSafeInteger(Number(count)) || Number(count) > MAX_CARTON_LABELS) {
    throw new ShipmentLabelInputError(`箱数 nb 必须是 1–${MAX_CARTON_LABELS} 的整数`);
  }
  return {
    shipmentNo: identifier(data.id, "货件号 id"),
    boxCount: Number(count),
    shopId: identifier(data.shopId, "店铺 ID", true),
    shopName: labelText(data.shopName, "店铺别名 shopName", !status.isNew, 80),
    warehouseNumber: labelText(data.warehouseNumber, "仓库编号 warehouseNumber", status.isNew, 20),
    warehouseName: labelText(data.warehouseName, "仓库名称 warehouseName", status.isNew, 160),
    isLocal: status.isNew,
  };
}

// Payloads decoded from historical labels, including the legacy JSON spacing.
export function getShipmentLabelQrPayload(shipmentNo: string, box: number, isLocal: boolean) {
  const id = `${shipmentNo}/${box}`;
  return isLocal
    ? JSON.stringify({ id, reference_id: id, t: "inb", ops_data: { source: "seller", container_type: "box" } })
    : `{"id": ${JSON.stringify(id)}, "operation": "fbm", "type":"inbound","source":"seller"}`;
}

// The historical PDFs use these exact point dimensions (approximately 100 mm).
const WIDTH = 283.5;
const LOCAL_HEIGHT = 425.25;

function text(
  page: PDFPage, font: PDFFont, value: string, x: number, y: number,
  size: number, maxWidth: number, options: { center?: boolean; stroke?: boolean } = {},
) {
  const naturalWidth = font.widthOfTextAtSize(value, size);
  const fittedSize = Math.min(size, naturalWidth ? size * maxWidth / naturalWidth : size);
  if (fittedSize < 6) throw new ShipmentLabelInputError("标签文字过长，请缩短店铺别名或仓库名称");
  const width = font.widthOfTextAtSize(value, fittedSize);
  page.pushOperators(pushGraphicsState());
  if (options.stroke) {
    page.pushOperators(setTextRenderingMode(TextRenderingMode.FillAndOutline), setLineWidth(fittedSize / 30));
  }
  page.drawText(value, { x: options.center ? x + (maxWidth - width) / 2 : x, y, size: fittedSize, font });
  page.pushOperators(popGraphicsState());
}

let logoBytes: Promise<[Buffer, Buffer]> | undefined;
function loadLogos() {
  logoBytes ??= Promise.all([
    readFile(path.join(process.cwd(), "public/shipment-labels/mercado-libre.png")),
    readFile(path.join(process.cwd(), "public/shipment-labels/full.png")),
  ]).catch((error) => { logoBytes = undefined; throw error; });
  return logoBytes;
}

/** Generate all cartons offline. No carrier API, browser, or remote font is used. */
export async function generateShipmentLabels(request: unknown) {
  const input = parseShipmentLabelRequest(request);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logos = input.isLocal
    ? await Promise.all((await loadLogos()).map((bytes) => pdf.embedPng(bytes)))
    : null;
  pdf.setTitle(`Shipment ${input.shipmentNo} carton labels`);
  pdf.setCreator("LYB ERP");
  for (let box = 1; box <= input.boxCount; box += 1) {
    const page = pdf.addPage([WIDTH, input.isLocal ? LOCAL_HEIGHT : WIDTH]);
    const cartonId = `${input.shipmentNo}/${box}`;
    const qr = await pdf.embedPng(await QRCode.toBuffer(
      getShipmentLabelQrPayload(input.shipmentNo, box, input.isLocal),
      { type: "png", errorCorrectionLevel: "L", margin: 0, scale: 8 },
    ));
    if (input.isLocal && logos) {
      page.drawImage(logos[0], { x: 10, y: 382.73, width: 40, height: 28 });
      page.drawImage(logos[1], { x: 203.5, y: 365.71, width: 64, height: 64 });
      text(page, font, `#${input.shopId}`, 55, 401.28, 8.5, 143);
      text(page, font, `Envío: ${cartonId}`, 55, 388.54, 8.5, 143);
      page.drawRectangle({ x: 177.75, y: 344.75, width: 105.5, height: 22.34, borderWidth: 0.5, borderColor: rgb(0, 0, 0) });
      text(page, font, "ENTREGAR A FULL", 177.75, 353.5, 7.9, 105.5, { center: true, stroke: true });
      text(page, font, "NO VÁLIDA PARA COLECTA", 177, 335.32, 7.5, 106.5, { stroke: true });
      page.drawLine({ start: { x: 177, y: 334.32 }, end: { x: 217.26, y: 334.32 }, thickness: 0.3 });
      page.drawImage(qr, { x: 100.75, y: 201.63, width: 82, height: 82 });
      text(page, bold, cartonId, 15, 184.38, 9.9, WIDTH - 30, { center: true });
      text(page, bold, input.warehouseNumber, 15, 115.1, 56.7, WIDTH - 30, { center: true });
      page.drawLine({ start: { x: 0, y: 80.25 }, end: { x: WIDTH, y: 80.25 }, thickness: 0.5 });
      text(page, font, "BULTOS", 15, 49.76, 8.5, WIDTH - 30, { stroke: true });
      text(page, font, input.warehouseName, 15, 36.5, 8.5, WIDTH - 30);
      text(page, font, `Envío: ${cartonId}`, 15, 23.76, 8.5, WIDTH - 30);
    } else {
      text(page, font, "ETIQUETA DE BULTO", 15, 246.55, 17, WIDTH - 30, { center: true, stroke: true });
      page.drawImage(qr, { x: 75.75, y: 95.75, width: 132, height: 132 });
      text(page, font, `ENVÍO: ${cartonId}`, 15, 69.32, 17, WIDTH - 30, { center: true, stroke: true });
      text(page, font, input.shopName, 15, 36.94, 11, WIDTH - 30, { center: true, stroke: true });
      text(page, font, `ID: ${input.shopId}`, 15, 20.45, 11, WIDTH - 30, { center: true, stroke: true });
    }
  }
  return {
    buffer: await pdf.save(),
    contentType: "application/pdf" as const,
    fileName: `shipment-label-${input.shipmentNo}.pdf`,
  };
}
