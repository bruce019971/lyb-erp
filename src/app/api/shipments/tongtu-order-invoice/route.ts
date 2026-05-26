import JSZip from "jszip";
import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { verifyLogisticsOperator } from "../../logistics/rishenghui/_lib";

export const runtime = "nodejs";

type TongtuOrderInvoiceRequestBody = {
  shipmentId?: string;
};

type ShipmentRow = {
  id: string;
  order_store: string | null;
  logistics_provider: string | null;
  shipment_no: string | null;
  order_invoice_url: string | null;
  product_name: string | null;
  box_count: number | null;
  total_qty: number | null;
};

type StoreRow = {
  seller_name: string | null;
  seller_id: string | null;
};

type ProductRow = {
  product_name: string | null;
  product_image_url: string | null;
  product_unit_price: number | null;
  customs_code: string | null;
  product_category: string | null;
  product_usage: string | null;
  product_attribute: string | null;
  product_material: string | null;
  product_english_name: string | null;
};

type LogisticsProviderRow = {
  provider_name: string | null;
  invoice_template_url: string | null;
};

type InvoiceContext = {
  shipment: ShipmentRow;
  product: ProductRow | null;
  store: StoreRow | null;
};

type CellValue = string | number;
type ImageInfo = {
  extension: string;
  contentType: string;
  width: number;
  height: number;
};
type CellRange = {
  startColumnNumber: number;
  endColumnNumber: number;
  startRowNumber: number;
  endRowNumber: number;
};
type PictureAnchor = {
  columnNumber: number;
  rowNumber: number;
  columnOffsetEmu: number;
  rowOffsetEmu: number;
  widthEmu: number;
  heightEmu: number;
};
type ZeroBasedCellRange = {
  startColumn: number;
  endColumn: number;
  startRow: number;
  endRow: number;
};
type WorksheetPart = {
  sheetPath: string;
  sheetRelsPath: string;
};

const CONTENT_TYPES_PATH = "[Content_Types].xml";
const WORKBOOK_RELS_PATH = "xl/_rels/workbook.xml.rels";
const TARGET_SHEET_NAME = "发票模板";
const WORKSHEET_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";
const WORKBOOK_WORKSHEET_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
const IMAGE_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const CALC_CHAIN_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain";
const DRAWING_NS =
  'xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const EMU_PER_PIXEL = 9525;
const POINT_TO_PIXEL = 96 / 72;
const DEFAULT_EXCEL_COLUMN_WIDTH = 8.43;
const DEFAULT_EXCEL_ROW_HEIGHT = 15;
const IMAGE_CELL_PADDING_PX = 2;

function getRequiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

function toDisplayText(value?: string | number | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  return value?.toString().trim() || "";
}

function toNumber(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

function multiplyMoney(quantity?: number | null, unitPrice?: number | null) {
  if (
    typeof quantity !== "number" ||
    !Number.isFinite(quantity) ||
    typeof unitPrice !== "number" ||
    !Number.isFinite(unitPrice)
  ) {
    return "";
  }

  return Math.round(quantity * unitPrice * 100) / 100;
}

function getSafeFileNamePart(value?: string | null) {
  return value?.trim().replace(/[\\/:*?"<>|]+/g, "_") || "";
}

function getCacheBustedUrl(fileUrl: string, version: string | number) {
  const separator = fileUrl.includes("?") ? "&" : "?";

  return `${fileUrl}${separator}v=${encodeURIComponent(String(version))}`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnNameToNumber(columnName: string) {
  return columnName.split("").reduce((sum, char) => {
    return sum * 26 + char.toUpperCase().charCodeAt(0) - 64;
  }, 0);
}

function columnNumberToName(columnNumber: number) {
  let remaining = columnNumber;
  let columnName = "";

  while (remaining > 0) {
    const modulo = (remaining - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    remaining = Math.floor((remaining - modulo) / 26);
  }

  return columnName;
}

function parseCellAddress(address: string) {
  const match = /^([A-Z]+)(\d+)$/i.exec(address);
  if (!match) {
    throw new Error(`无效单元格地址：${address}`);
  }

  return {
    columnName: match[1].toUpperCase(),
    columnNumber: columnNameToNumber(match[1]),
    rowNumber: Number(match[2]),
  };
}

function getXmlAttribute(xml: string, attributeName: string) {
  const match = new RegExp(`\\b${attributeName}="([^"]*)"`).exec(xml);

  return match?.[1] ?? "";
}

function getPreservedCellAttributes(existingCellXml?: string) {
  const existingAttributes = existingCellXml?.match(/^<c\b([^>]*)/)?.[1] ?? "";
  const style = getXmlAttribute(`<c${existingAttributes}>`, "s");

  return style ? `s="${style}"` : "";
}

function getCellXml(address: string, value: CellValue, existingCellXml?: string) {
  const preservedAttributes = getPreservedCellAttributes(existingCellXml);
  const attributes = [`r="${address}"`];

  if (preservedAttributes) {
    attributes.push(preservedAttributes);
  }

  if (typeof value === "number") {
    return `<c ${attributes.join(" ")}><v>${value}</v></c>`;
  }

  attributes.push('t="inlineStr"');

  return `<c ${attributes.join(" ")}><is><t>${escapeXml(value)}</t></is></c>`;
}

function getBlankCellXml(address: string, existingCellXml?: string) {
  const preservedAttributes = getPreservedCellAttributes(existingCellXml);
  const attributes = [`r="${address}"`];

  if (preservedAttributes) {
    attributes.push(preservedAttributes);
  }

  return `<c ${attributes.join(" ")}/>`;
}

function setCellValue(sheetXml: string, address: string, value: CellValue) {
  const effectiveAddress = getEffectiveCellAddress(sheetXml, address);
  const { rowNumber } = parseCellAddress(effectiveAddress);
  const cellPattern = new RegExp(`<c\\b[^>]*\\br="${effectiveAddress}"[^>]*(?:/>|>[\\s\\S]*?</c>)`);
  let nextSheetXml = sheetXml;

  if (cellPattern.test(sheetXml)) {
    nextSheetXml = sheetXml.replace(cellPattern, (existingCellXml) =>
      getCellXml(effectiveAddress, value, existingCellXml),
    );
    return clearMergedRangeNonTopLeftValues(nextSheetXml, address);
  }

  const cellXml = getCellXml(effectiveAddress, value);
  const rowPattern = new RegExp(`(<row\\b[^>]*\\br="${rowNumber}"[^>]*>)([\\s\\S]*?)(</row>)`);
  const rowMatch = rowPattern.exec(sheetXml);
  if (rowMatch) {
    const rowCells = rowMatch[2];
    const inheritedCellXml = findNearestStyledCellXml(rowCells, effectiveAddress);
    const nextCellXml = getCellXml(effectiveAddress, value, inheritedCellXml);
    const insertIndex = findCellInsertIndex(rowCells, effectiveAddress);
    const nextRowCells = `${rowCells.slice(0, insertIndex)}${nextCellXml}${rowCells.slice(insertIndex)}`;
    nextSheetXml = sheetXml.replace(rowPattern, `${rowMatch[1]}${nextRowCells}${rowMatch[3]}`);
    return clearMergedRangeNonTopLeftValues(nextSheetXml, address);
  }

  const sheetDataCloseIndex = sheetXml.indexOf("</sheetData>");
  if (sheetDataCloseIndex < 0) {
    throw new Error("通途发票模板工作表结构异常，缺少 sheetData");
  }

  const rowXml = `<row r="${rowNumber}">${cellXml}</row>`;
  nextSheetXml = `${sheetXml.slice(0, sheetDataCloseIndex)}${rowXml}${sheetXml.slice(sheetDataCloseIndex)}`;
  return clearMergedRangeNonTopLeftValues(nextSheetXml, address);
}

function clearCellValue(sheetXml: string, address: string) {
  const effectiveAddress = getEffectiveCellAddress(sheetXml, address);
  return clearCellValueAtAddress(sheetXml, effectiveAddress);
}

function clearCellValueAtAddress(sheetXml: string, address: string) {
  const cellPattern = new RegExp(`<c\\b[^>]*\\br="${address}"[^>]*(?:/>|>[\\s\\S]*?</c>)`);

  if (!cellPattern.test(sheetXml)) {
    return sheetXml;
  }

  return sheetXml.replace(cellPattern, (existingCellXml) =>
    getBlankCellXml(address, existingCellXml),
  );
}

function getEffectiveCellAddress(sheetXml: string, address: string) {
  const mergedRange = getMergedCellRange(sheetXml, address);

  if (!mergedRange) return address;

  return `${columnNumberToName(mergedRange.startColumnNumber)}${mergedRange.startRowNumber}`;
}

function clearMergedRangeNonTopLeftValues(sheetXml: string, address: string) {
  const mergedRange = getMergedCellRange(sheetXml, address);
  if (!mergedRange) return sheetXml;

  let nextSheetXml = sheetXml;
  const topLeftAddress = `${columnNumberToName(mergedRange.startColumnNumber)}${mergedRange.startRowNumber}`;

  for (
    let rowNumber = mergedRange.startRowNumber;
    rowNumber <= mergedRange.endRowNumber;
    rowNumber += 1
  ) {
    for (
      let columnNumber = mergedRange.startColumnNumber;
      columnNumber <= mergedRange.endColumnNumber;
      columnNumber += 1
    ) {
      const cellAddress = `${columnNumberToName(columnNumber)}${rowNumber}`;
      if (cellAddress === topLeftAddress) continue;

      nextSheetXml = clearCellValueAtAddress(nextSheetXml, cellAddress);
    }
  }

  return nextSheetXml;
}

function findCellInsertIndex(rowCellsXml: string, address: string) {
  const { columnNumber } = parseCellAddress(address);
  const cellMatches = Array.from(rowCellsXml.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g));

  for (const match of cellMatches) {
    if (columnNameToNumber(match[1]) > columnNumber) {
      return match.index ?? rowCellsXml.length;
    }
  }

  return rowCellsXml.length;
}

function findNearestStyledCellXml(rowCellsXml: string, address: string) {
  const { columnNumber } = parseCellAddress(address);
  const cellMatches = Array.from(
    rowCellsXml.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g),
  );
  let nearestCellXml = "";
  let nearestDistance = Number.POSITIVE_INFINITY;

  cellMatches.forEach((match) => {
    const cellXml = match[0];
    if (!/\bs="[^"]*"/.test(cellXml)) return;

    const distance = Math.abs(columnNameToNumber(match[1]) - columnNumber);
    if (distance < nearestDistance) {
      nearestCellXml = cellXml;
      nearestDistance = distance;
    }
  });

  return nearestCellXml || undefined;
}

function ensureWorksheetDrawing(sheetXml: string, relationshipId: string) {
  if (/<drawing\b[^>]*\br:id=/.test(sheetXml)) {
    return sheetXml;
  }

  let nextSheetXml = sheetXml;
  if (!nextSheetXml.includes("xmlns:r=")) {
    nextSheetXml = nextSheetXml.replace(
      "<worksheet",
      '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
    );
  }

  const drawingXml = `<drawing r:id="${relationshipId}"/>`;
  const nextElementNames = [
    "legacyDrawing",
    "legacyDrawingHF",
    "picture",
    "oleObjects",
    "controls",
    "webPublishItems",
    "tableParts",
    "extLst",
  ];
  const nextElementIndex = nextElementNames
    .map((name) => nextSheetXml.indexOf(`<${name}`))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (typeof nextElementIndex === "number") {
    return `${nextSheetXml.slice(0, nextElementIndex)}${drawingXml}${nextSheetXml.slice(nextElementIndex)}`;
  }

  const worksheetCloseIndex = nextSheetXml.indexOf("</worksheet>");
  if (worksheetCloseIndex < 0) {
    throw new Error("通途发票模板工作表结构异常，缺少 worksheet");
  }

  return `${nextSheetXml.slice(0, worksheetCloseIndex)}${drawingXml}${nextSheetXml.slice(worksheetCloseIndex)}`;
}

function getExistingWorksheetDrawingRel(relsXml: string) {
  const relationshipMatches = Array.from(
    relsXml.matchAll(/<Relationship\b[^>]*\/>/g),
  );

  for (const match of relationshipMatches) {
    const relationshipXml = match[0];
    if (getXmlAttribute(relationshipXml, "Type") === WORKSHEET_REL_TYPE) {
      return {
        id: getXmlAttribute(relationshipXml, "Id"),
        target: getXmlAttribute(relationshipXml, "Target"),
      };
    }
  }

  return null;
}

function getNextRelationshipId(relsXml: string) {
  const ids = Array.from(relsXml.matchAll(/\bId="rId(\d+)"/g)).map((match) =>
    Number(match[1]),
  );
  return `rId${Math.max(0, ...ids) + 1}`;
}

function getNextImageIndex(zip: JSZip) {
  const imageIndexes = Object.keys(zip.files)
    .map((path) => /^xl\/media\/image(\d+)\./.exec(path)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number);
  return Math.max(0, ...imageIndexes) + 1;
}

function getPngSize(buffer: Buffer) {
  if (
    buffer.length >= 24 &&
    buffer.toString("ascii", 1, 4) === "PNG" &&
    buffer.readUInt32BE(12) === 0x49484452
  ) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  return null;
}

function getGifSize(buffer: Buffer) {
  const signature = buffer.toString("ascii", 0, 6);
  if (buffer.length >= 10 && (signature === "GIF87a" || signature === "GIF89a")) {
    return {
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8),
    };
  }

  return null;
}

function getJpegSize(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > buffer.length) break;

    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;

    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += length;
  }

  return null;
}

function getImageSize(buffer: Buffer) {
  return getPngSize(buffer) ?? getJpegSize(buffer) ?? getGifSize(buffer);
}

function getImageInfo(contentType: string, buffer: Buffer): ImageInfo | null {
  const normalized = contentType.toLowerCase();
  const size = getImageSize(buffer);
  if (!size?.width || !size.height) return null;

  if (normalized.includes("png") || getPngSize(buffer)) {
    return { extension: "png", contentType: "image/png", ...size };
  }
  if (normalized.includes("jpg") || normalized.includes("jpeg") || getJpegSize(buffer)) {
    return { extension: "jpeg", contentType: "image/jpeg", ...size };
  }
  if (normalized.includes("gif") || getGifSize(buffer)) {
    return { extension: "gif", contentType: "image/gif", ...size };
  }

  return null;
}

function appendRelationship(relsXml: string, relationshipXml: string) {
  const closeIndex = relsXml.indexOf("</Relationships>");
  if (closeIndex < 0) {
    throw new Error("通途发票模板关系文件结构异常");
  }

  return `${relsXml.slice(0, closeIndex)}${relationshipXml}${relsXml.slice(closeIndex)}`;
}

function createRelationshipsXml(relationshipXml: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationshipXml}</Relationships>`;
}

async function getTargetWorksheetPart(zip: JSZip): Promise<WorksheetPart> {
  const workbookFile = zip.file("xl/workbook.xml");
  const workbookRelsFile = zip.file(WORKBOOK_RELS_PATH);

  if (!workbookFile || !workbookRelsFile) {
    throw new Error("通途发票模板缺少工作簿结构文件");
  }

  const workbookXml = await workbookFile.async("string");
  const workbookRelsXml = await workbookRelsFile.async("string");
  const sheetMatches = Array.from(
    workbookXml.matchAll(/<sheet\b[^>]*>/g),
  );
  const targetSheetXml = sheetMatches
    .map((match) => match[0])
    .find((sheetXml) => getXmlAttribute(sheetXml, "name") === TARGET_SHEET_NAME);

  if (!targetSheetXml) {
    throw new Error(`通途发票模板缺少工作表：${TARGET_SHEET_NAME}`);
  }

  const relationshipId = getXmlAttribute(targetSheetXml, "r:id");
  if (!relationshipId) {
    throw new Error(`通途发票模板工作表 ${TARGET_SHEET_NAME} 缺少关系ID`);
  }

  const relationshipMatches = Array.from(
    workbookRelsXml.matchAll(/<Relationship\b[^>]*\/>/g),
  );
  const worksheetRelXml = relationshipMatches
    .map((match) => match[0])
    .find((relationshipXml) => {
      return (
        getXmlAttribute(relationshipXml, "Id") === relationshipId &&
        getXmlAttribute(relationshipXml, "Type") === WORKBOOK_WORKSHEET_REL_TYPE
      );
    });

  if (!worksheetRelXml) {
    throw new Error(`通途发票模板工作表 ${TARGET_SHEET_NAME} 关系文件异常`);
  }

  const target = getXmlAttribute(worksheetRelXml, "Target");
  const sheetPath = target.startsWith("/")
    ? target.slice(1)
    : `xl/${target}`.replace(/\/[^/]+\/\.\.\//g, "/");
  const sheetFileName = sheetPath.split("/").pop();

  if (!sheetFileName) {
    throw new Error(`通途发票模板工作表 ${TARGET_SHEET_NAME} 路径异常`);
  }

  return {
    sheetPath,
    sheetRelsPath: sheetPath.replace(
      /worksheets\/([^/]+)$/,
      "worksheets/_rels/$1.rels",
    ),
  };
}

function ensureContentType(contentTypesXml: string, extension: string, contentType: string) {
  const defaultPattern = new RegExp(`<Default\\b[^>]*Extension="${extension}"[^>]*/>`);
  if (defaultPattern.test(contentTypesXml)) return contentTypesXml;

  const closeIndex = contentTypesXml.indexOf("</Types>");
  if (closeIndex < 0) {
    throw new Error("通途发票模板内容类型文件结构异常");
  }

  const defaultXml = `<Default Extension="${extension}" ContentType="${contentType}"/>`;
  return `${contentTypesXml.slice(0, closeIndex)}${defaultXml}${contentTypesXml.slice(closeIndex)}`;
}

function ensureOverrideContentType(
  contentTypesXml: string,
  partName: string,
  contentType: string,
) {
  const overridePattern = new RegExp(
    `<Override\\b[^>]*PartName="${partName}"[^>]*/>`,
  );
  if (overridePattern.test(contentTypesXml)) return contentTypesXml;

  const closeIndex = contentTypesXml.indexOf("</Types>");
  if (closeIndex < 0) {
    throw new Error("通途发票模板内容类型文件结构异常");
  }

  const overrideXml = `<Override PartName="${partName}" ContentType="${contentType}"/>`;
  return `${contentTypesXml.slice(0, closeIndex)}${overrideXml}${contentTypesXml.slice(closeIndex)}`;
}

function getWorksheetRelationshipTargetPath(target: string) {
  if (target.startsWith("../")) {
    return `xl/${target.slice(3)}`;
  }

  if (target.startsWith("/")) {
    return target.slice(1);
  }

  return `xl/worksheets/${target}`.replace(/\/[^/]+\/\.\.\//g, "/");
}

function getColumnWidthPx(width?: number) {
  const normalizedWidth = width ?? DEFAULT_EXCEL_COLUMN_WIDTH;

  if (normalizedWidth < 1) {
    return Math.floor(normalizedWidth * 12 + 0.5);
  }

  return Math.floor(normalizedWidth * 7 + 5);
}

function getRowHeightPx(height?: number) {
  return (height ?? DEFAULT_EXCEL_ROW_HEIGHT) * POINT_TO_PIXEL;
}

function getColumnWidths(sheetXml: string) {
  const widths = new Map<number, number>();
  const customColumns = Array.from(
    sheetXml.matchAll(/<col\b[^>]*(?:\/>|>[\s\S]*?<\/col>)/g),
  );

  customColumns.forEach((match) => {
    const colXml = match[0];
    const min = Number(getXmlAttribute(colXml, "min"));
    const max = Number(getXmlAttribute(colXml, "max"));
    const width = Number(getXmlAttribute(colXml, "width"));

    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(width)) {
      return;
    }

    for (let columnNumber = min; columnNumber <= max; columnNumber += 1) {
      widths.set(columnNumber, width);
    }
  });

  return widths;
}

function getRowHeights(sheetXml: string) {
  const heights = new Map<number, number>();
  const rows = Array.from(sheetXml.matchAll(/<row\b[^>]*(?:\/>|>[\s\S]*?<\/row>)/g));

  rows.forEach((match) => {
    const rowXml = match[0];
    const rowNumber = Number(getXmlAttribute(rowXml, "r"));
    const height = Number(getXmlAttribute(rowXml, "ht"));

    if (Number.isFinite(rowNumber) && Number.isFinite(height)) {
      heights.set(rowNumber, height);
    }
  });

  return heights;
}

function getMergedCellRange(sheetXml: string, address: string): CellRange | null {
  const cell = parseCellAddress(address);
  const mergeMatches = Array.from(sheetXml.matchAll(/<mergeCell\b[^>]*\bref="([^"]+)"[^>]*\/>/g));

  for (const match of mergeMatches) {
    const [startAddress, endAddress = startAddress] = match[1].split(":");
    const start = parseCellAddress(startAddress);
    const end = parseCellAddress(endAddress);

    if (
      cell.columnNumber >= start.columnNumber &&
      cell.columnNumber <= end.columnNumber &&
      cell.rowNumber >= start.rowNumber &&
      cell.rowNumber <= end.rowNumber
    ) {
      return {
        startColumnNumber: start.columnNumber,
        endColumnNumber: end.columnNumber,
        startRowNumber: start.rowNumber,
        endRowNumber: end.rowNumber,
      };
    }
  }

  return null;
}

function getCellRange(sheetXml: string, address: string): CellRange {
  const cell = parseCellAddress(address);

  return (
    getMergedCellRange(sheetXml, address) ?? {
      startColumnNumber: cell.columnNumber,
      endColumnNumber: cell.columnNumber,
      startRowNumber: cell.rowNumber,
      endRowNumber: cell.rowNumber,
    }
  );
}

function getRangeSizePx(sheetXml: string, range: CellRange) {
  const columnWidths = getColumnWidths(sheetXml);
  const rowHeights = getRowHeights(sheetXml);
  let width = 0;
  let height = 0;

  for (
    let columnNumber = range.startColumnNumber;
    columnNumber <= range.endColumnNumber;
    columnNumber += 1
  ) {
    width += getColumnWidthPx(columnWidths.get(columnNumber));
  }

  for (
    let rowNumber = range.startRowNumber;
    rowNumber <= range.endRowNumber;
    rowNumber += 1
  ) {
    height += getRowHeightPx(rowHeights.get(rowNumber));
  }

  return {
    width,
    height,
  };
}

function getPictureAnchor(sheetXml: string, address: string, imageInfo: ImageInfo): PictureAnchor {
  const cellRange = getCellRange(sheetXml, address);
  const rangeSize = getRangeSizePx(sheetXml, cellRange);
  const availableWidth = Math.max(1, rangeSize.width - IMAGE_CELL_PADDING_PX * 2);
  const availableHeight = Math.max(1, rangeSize.height - IMAGE_CELL_PADDING_PX * 2);
  const scale = Math.min(
    availableWidth / imageInfo.width,
    availableHeight / imageInfo.height,
  );
  const width = Math.max(1, imageInfo.width * scale);
  const height = Math.max(1, imageInfo.height * scale);
  const columnOffset = Math.max(0, (rangeSize.width - width) / 2);
  const rowOffset = Math.max(0, (rangeSize.height - height) / 2);

  return {
    columnNumber: cellRange.startColumnNumber,
    rowNumber: cellRange.startRowNumber,
    columnOffsetEmu: Math.round(columnOffset * EMU_PER_PIXEL),
    rowOffsetEmu: Math.round(rowOffset * EMU_PER_PIXEL),
    widthEmu: Math.round(width * EMU_PER_PIXEL),
    heightEmu: Math.round(height * EMU_PER_PIXEL),
  };
}

function getPictureAnchorXml(
  relationshipId: string,
  pictureName: string,
  pictureId: number,
  anchor: PictureAnchor,
) {
  const column = anchor.columnNumber - 1;
  const row = anchor.rowNumber - 1;
  const endColumnOffset = anchor.columnOffsetEmu + anchor.widthEmu;
  const endRowOffset = anchor.rowOffsetEmu + anchor.heightEmu;

  return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${column}</xdr:col><xdr:colOff>${anchor.columnOffsetEmu}</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>${anchor.rowOffsetEmu}</xdr:rowOff></xdr:from><xdr:to><xdr:col>${column}</xdr:col><xdr:colOff>${endColumnOffset}</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>${endRowOffset}</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${pictureId}" name="${escapeXml(pictureName)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`;
}

function ensureDrawingNamespaces(drawingXml: string) {
  let nextDrawingXml = drawingXml;
  if (!nextDrawingXml.includes("xmlns:xdr=")) {
    nextDrawingXml = nextDrawingXml.replace(
      "<xdr:wsDr",
      '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"',
    );
  }
  if (!nextDrawingXml.includes("xmlns:a=")) {
    nextDrawingXml = nextDrawingXml.replace(
      "<xdr:wsDr",
      '<xdr:wsDr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
    );
  }
  if (!nextDrawingXml.includes("xmlns:r=")) {
    nextDrawingXml = nextDrawingXml.replace(
      "<xdr:wsDr",
      '<xdr:wsDr xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
    );
  }
  return nextDrawingXml;
}

function getNextPictureId(drawingXml: string) {
  const ids = Array.from(drawingXml.matchAll(/<xdr:cNvPr\b[^>]*\bid="(\d+)"/g))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));

  return Math.max(0, ...ids) + 1;
}

function getAnchorNumber(anchorXml: string, tagName: string) {
  const match = new RegExp(`<xdr:${tagName}>(\\d+)</xdr:${tagName}>`).exec(
    anchorXml,
  );

  return match ? Number(match[1]) : null;
}

function getZeroBasedCellRange(sheetXml: string, address: string): ZeroBasedCellRange {
  const cellRange = getCellRange(sheetXml, address);

  return {
    startColumn: cellRange.startColumnNumber - 1,
    endColumn: cellRange.endColumnNumber - 1,
    startRow: cellRange.startRowNumber - 1,
    endRow: cellRange.endRowNumber - 1,
  };
}

function anchorIntersectsRange(anchorXml: string, range: ZeroBasedCellRange) {
  const fromMatch = /<xdr:from>[\s\S]*?<\/xdr:from>/.exec(anchorXml)?.[0] ?? "";
  const startColumn = getAnchorNumber(fromMatch, "col");
  const startRow = getAnchorNumber(fromMatch, "row");

  if (startColumn === null || startRow === null) {
    return false;
  }

  return (
    startColumn >= range.startColumn &&
    startColumn <= range.endColumn &&
    startRow >= range.startRow &&
    startRow <= range.endRow
  );
}

function removeProductImageAnchors(drawingXml: string, sheetXml: string, address: string) {
  const range = getZeroBasedCellRange(sheetXml, address);
  const anchorPattern =
    /<xdr:(?:oneCellAnchor|twoCellAnchor)\b[\s\S]*?<\/xdr:(?:oneCellAnchor|twoCellAnchor)>/g;

  return drawingXml.replace(anchorPattern, (anchorXml) => {
    if (/name="product-image-[^"]*"/.test(anchorXml)) {
      return "";
    }

    return anchorIntersectsRange(anchorXml, range) ? "" : anchorXml;
  });
}

function appendPictureToDrawing(
  drawingXml: string,
  relationshipId: string,
  pictureName: string,
  sheetXml: string,
  anchor: PictureAnchor,
) {
  const normalizedDrawingXml = removeProductImageAnchors(
    ensureDrawingNamespaces(drawingXml),
    sheetXml,
    "W17",
  );
  const normalizedCloseIndex = normalizedDrawingXml.indexOf("</xdr:wsDr>");
  if (normalizedCloseIndex < 0) {
    throw new Error("通途发票模板 drawing 文件结构异常");
  }
  const pictureId = getNextPictureId(normalizedDrawingXml);
  const pictureXml = getPictureAnchorXml(
    relationshipId,
    pictureName,
    pictureId,
    anchor,
  );

  return `${normalizedDrawingXml.slice(0, normalizedCloseIndex)}${pictureXml}${normalizedDrawingXml.slice(normalizedCloseIndex)}`;
}

async function getTemplateZip(templateUrl: string) {
  const response = await fetch(templateUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("通途下单发票模板读取失败");
  }

  return JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
}

function getTongtuCellValues(context: InvoiceContext) {
  const shipmentNo = toDisplayText(context.shipment.shipment_no);
  const totalQty = toNumber(context.shipment.total_qty);
  const unitPrice = toNumber(context.product?.product_unit_price);
  const productAttribute = String(
    toDisplayText(context.product?.product_attribute),
  );
  const cellValues = {
    B4: shipmentNo,
    A17: shipmentNo,
    C17: shipmentNo,
    B17: toDisplayText(context.store?.seller_id),
    D17: toDisplayText(context.product?.product_category),
    E17: toNumber(context.shipment.box_count),
    F17: toDisplayText(context.product?.product_english_name),
    G17: toDisplayText(context.product?.product_material),
    H17: toDisplayText(context.product?.product_material),
    I17: toDisplayText(context.product?.product_usage),
    J17: toDisplayText(context.product?.product_usage),
    K17: toDisplayText(context.product?.customs_code),
    N17: totalQty,
    O17: unitPrice,
    P17: multiplyMoney(
      context.shipment.total_qty,
      context.product?.product_unit_price,
    ),
  } satisfies Record<string, CellValue>;

  if (productAttribute.includes("纺织品")) {
    return {
      ...cellValues,
      B6: "美转墨-海运双清包税平台仓B类经济线",
    } satisfies Record<string, CellValue>;
  }

  return cellValues;
}

async function appendProductImage(
  zip: JSZip,
  worksheetPart: WorksheetPart,
  sheetXml: string,
  imageUrl?: string | null,
) {
  const trimmedImageUrl = imageUrl?.trim();
  if (!trimmedImageUrl) return clearCellValue(sheetXml, "W17");

  const response = await fetch(trimmedImageUrl);
  if (!response.ok) return clearCellValue(sheetXml, "W17");

  const imageBuffer = Buffer.from(await response.arrayBuffer());
  const imageInfo = getImageInfo(
    response.headers.get("content-type") ?? "",
    imageBuffer,
  );
  if (!imageInfo) return clearCellValue(sheetXml, "W17");

  const imageIndex = getNextImageIndex(zip);
  const imagePath = `xl/media/image${imageIndex}.${imageInfo.extension}`;
  const imageTarget = `../media/image${imageIndex}.${imageInfo.extension}`;
  zip.file(imagePath, imageBuffer);

  const contentTypesFile = zip.file(CONTENT_TYPES_PATH);
  if (!contentTypesFile) {
    throw new Error("通途发票模板缺少 [Content_Types].xml");
  }
  let sheetRelsXml = zip.file(worksheetPart.sheetRelsPath)
    ? await zip.file(worksheetPart.sheetRelsPath)!.async("string")
    : createRelationshipsXml("");
  const existingDrawingRel = getExistingWorksheetDrawingRel(sheetRelsXml);
  let drawingTarget = existingDrawingRel?.target ?? "";
  let drawingRelationshipId = existingDrawingRel?.id ?? "";

  if (!drawingTarget) {
    drawingRelationshipId = getNextRelationshipId(sheetRelsXml);
    drawingTarget = "../drawings/drawing1.xml";
    sheetRelsXml = appendRelationship(
      sheetRelsXml,
      `<Relationship Id="${drawingRelationshipId}" Type="${WORKSHEET_REL_TYPE}" Target="${drawingTarget}"/>`,
    );
  }
  zip.file(worksheetPart.sheetRelsPath, sheetRelsXml);

  const drawingPath = getWorksheetRelationshipTargetPath(drawingTarget);
  let contentTypesXml = await contentTypesFile.async("string");
  contentTypesXml = ensureContentType(
    contentTypesXml,
    imageInfo.extension,
    imageInfo.contentType,
  );
  contentTypesXml = ensureOverrideContentType(
    contentTypesXml,
    `/${drawingPath}`,
    "application/vnd.openxmlformats-officedocument.drawing+xml",
  );
  zip.file(CONTENT_TYPES_PATH, contentTypesXml);

  const drawingXml = zip.file(drawingPath)
    ? await zip.file(drawingPath)!.async("string")
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr ${DRAWING_NS}></xdr:wsDr>`;

  const drawingRelsPath = drawingPath.replace("xl/drawings/", "xl/drawings/_rels/") + ".rels";
  const drawingRelsXml = zip.file(drawingRelsPath)
    ? await zip.file(drawingRelsPath)!.async("string")
    : createRelationshipsXml("");
  const imageRelationshipId = getNextRelationshipId(drawingRelsXml);

  zip.file(
    drawingRelsPath,
    appendRelationship(
      drawingRelsXml,
      `<Relationship Id="${imageRelationshipId}" Type="${IMAGE_REL_TYPE}" Target="${imageTarget}"/>`,
    ),
  );
  zip.file(
    drawingPath,
    appendPictureToDrawing(
      drawingXml,
      imageRelationshipId,
      `product-image-${imageIndex}.${imageInfo.extension}`,
      sheetXml,
      getPictureAnchor(sheetXml, "W17", imageInfo),
    ),
  );

  return ensureWorksheetDrawing(clearCellValue(sheetXml, "W17"), drawingRelationshipId);
}

async function removeCalcChain(zip: JSZip) {
  if (zip.file("xl/calcChain.xml")) {
    zip.remove("xl/calcChain.xml");
  }

  const contentTypesFile = zip.file(CONTENT_TYPES_PATH);
  if (contentTypesFile) {
    const contentTypesXml = await contentTypesFile.async("string");
    zip.file(
      CONTENT_TYPES_PATH,
      contentTypesXml.replace(
        /<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/,
        "",
      ),
    );
  }

  const workbookRelsFile = zip.file(WORKBOOK_RELS_PATH);
  if (workbookRelsFile) {
    const workbookRelsXml = await workbookRelsFile.async("string");
    const calcChainPattern = new RegExp(
      `<Relationship\\b[^>]*Type="${CALC_CHAIN_REL_TYPE}"[^>]*/>`,
    );
    zip.file(WORKBOOK_RELS_PATH, workbookRelsXml.replace(calcChainPattern, ""));
  }
}

async function createTongtuInvoiceBuffer(templateUrl: string, context: InvoiceContext) {
  const zip = await getTemplateZip(templateUrl);
  const worksheetPart = await getTargetWorksheetPart(zip);
  const sheetFile = zip.file(worksheetPart.sheetPath);
  if (!sheetFile) {
    throw new Error(`通途发票模板缺少工作表文件：${TARGET_SHEET_NAME}`);
  }

  let sheetXml = await sheetFile.async("string");
  const cellValues = getTongtuCellValues(context);
  Object.entries(cellValues).forEach(([address, value]) => {
    sheetXml = setCellValue(sheetXml, address, value);
  });
  sheetXml = await appendProductImage(
    zip,
    worksheetPart,
    sheetXml,
    context.product?.product_image_url,
  );
  zip.file(worksheetPart.sheetPath, sheetXml);
  await removeCalcChain(zip);

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}

export async function POST(request: Request) {
  try {
    await verifyLogisticsOperator();

    const body = (await request.json()) as TongtuOrderInvoiceRequestBody;
    const shipmentId = getRequiredText(body.shipmentId, "缺少货件ID");
    const adminClient = createSupabaseAdminClient();
    const { data: shipmentData, error: shipmentError } = await adminClient
      .from("shipment_records")
      .select(
        "id, order_store, logistics_provider, shipment_no, order_invoice_url, product_name, box_count, total_qty",
      )
      .eq("status", "有效")
      .eq("id", shipmentId)
      .single();

    if (shipmentError) {
      throw shipmentError;
    }

    const shipment = shipmentData as ShipmentRow;
    const logisticsProviderName = shipment.logistics_provider?.trim();
    if (logisticsProviderName !== "通途") {
      throw new Error("当前货件物流商不是通途");
    }

    const { data: logisticsData, error: logisticsError } = await adminClient
      .from("logistics_providers")
      .select("provider_name, invoice_template_url")
      .eq("provider_name", logisticsProviderName)
      .single();

    if (logisticsError) {
      throw logisticsError;
    }

    const logisticsProvider = logisticsData as LogisticsProviderRow;
    const templateUrl = logisticsProvider.invoice_template_url?.trim();
    if (!templateUrl) {
      throw new Error("通途物流商未上传发票模板");
    }

    const storeName = shipment.order_store?.trim();
    const { data: storeData, error: storeError } = storeName
      ? await adminClient
          .from("stores")
          .select("seller_name, seller_id")
          .eq("seller_name", storeName)
          .maybeSingle()
      : { data: null, error: null };

    if (storeError) {
      throw storeError;
    }

    const productName = shipment.product_name?.trim();
    let productQuery = adminClient
      .from("products")
      .select(
        "product_name, product_image_url, product_unit_price, customs_code, product_category, product_usage, product_attribute, product_material, product_english_name",
      )
      .eq("status", "有效");

    if (productName) {
      productQuery = productQuery.eq("product_name", productName);
    }

    if (storeName) {
      productQuery = productQuery.eq("store_name", storeName);
    }

    const { data: productData, error: productError } = await productQuery
      .limit(1)
      .maybeSingle();

    if (productError) {
      throw productError;
    }

    const context: InvoiceContext = {
      shipment,
      store: storeData as StoreRow | null,
      product: productData as ProductRow | null,
    };
    const output = await createTongtuInvoiceBuffer(templateUrl, context);

    const shipmentNo = getSafeFileNamePart(shipment.shipment_no) || shipment.id;
    const fileName = `TT_${shipmentNo}_发票.xlsx`;
    const storagePath = `shipment-order-invoices/${shipment.id}/tongtu-order-invoice.xlsx`;
    const generatedAt = Date.now();

    const { error: uploadError } = await adminClient.storage
      .from("product-images")
      .upload(storagePath, output, {
        cacheControl: "0",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } = adminClient.storage
      .from("product-images")
      .getPublicUrl(storagePath);
    const fileUrl = getCacheBustedUrl(publicUrlData.publicUrl, generatedAt);
    const { data: updatedShipment, error: updateError } = await adminClient
      .from("shipment_records")
      .update({
        order_invoice_url: fileUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shipment.id)
      .select("*")
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      data: updatedShipment,
      fileUrl,
      fileName,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "通途下单发票生成失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
