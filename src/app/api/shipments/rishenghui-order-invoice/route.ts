import ExcelJS from "exceljs";
import type { Buffer as ExcelBuffer } from "exceljs";
import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { verifyLogisticsOperator } from "../../logistics/rishenghui/_lib";

export const runtime = "nodejs";

type RishenghuiOrderInvoiceRequestBody = {
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
  pcs_per_box: number | null;
  total_qty: number | null;
  goods_value: number | null;
  delivery_status: string | null;
  warehouse_arrived_status: string | null;
  overseas_warehouse_arrived_at: string | null;
};

type StoreRow = {
  seller_name: string | null;
  seller_id: string | null;
  seller_code: string | null;
};

type ProductRow = {
  product_name: string | null;
  store_name: string | null;
  product_image_url: string | null;
  single_gross_weight: number | null;
  product_unit_price: number | null;
  pcs_per_carton: number | null;
  customs_code: string | null;
  product_category: string | null;
  product_usage: string | null;
  product_attribute: string | null;
  product_material: string | null;
  product_english_name: string | null;
  sku: string | null;
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

const DETAIL_LABELS = new Set([
  "箱唛号",
  "预约号ID",
  "中文品名",
  "英文品名",
  "材质",
  "用途",
  "国外海关编码",
  "产品类型",
  "单箱产品数量",
  "箱数",
  "单个产品申报单价",
  "单个产品净重",
  "总产品数量",
  "总申报金额",
  "SKU NO",
  "产品高清图片",
]);

function getRequiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

function isShipmentLocked(record: ShipmentRow) {
  return (
    record.delivery_status === "是" ||
    record.warehouse_arrived_status === "是" ||
    Boolean(record.overseas_warehouse_arrived_at)
  );
}

function normalizeCellText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    const candidate = value as {
      text?: unknown;
      result?: unknown;
      richText?: Array<{ text?: unknown }>;
      hyperlink?: unknown;
    };
    if (Array.isArray(candidate.richText)) {
      return candidate.richText
        .map((item) => (typeof item.text === "string" ? item.text : ""))
        .join("")
        .trim();
    }
    if (typeof candidate.text === "string") return candidate.text.trim();
    if (candidate.result !== undefined) return normalizeCellText(candidate.result);
    if (typeof candidate.hyperlink === "string") return candidate.hyperlink.trim();
  }

  return "";
}

function normalizeLabel(value: unknown) {
  return normalizeCellText(value)
    .replace(/[：:]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function isTargetLabel(value: unknown, label: string) {
  const normalizedValue = normalizeLabel(value);
  const normalizedLabel = normalizeLabel(label);

  return (
    normalizedValue === normalizedLabel ||
    normalizedValue.includes(normalizedLabel)
  );
}

function toDisplayText(value?: string | number | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  return value?.toString().trim() || "";
}

function toNumber(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

function getBoxCount(shipment: ShipmentRow) {
  return typeof shipment.box_count === "number" && Number.isFinite(shipment.box_count)
    ? Math.max(0, Math.floor(shipment.box_count))
    : 0;
}

function getDetailValue(label: string, context: InvoiceContext) {
  const { shipment, product, store } = context;

  switch (label) {
    case "箱唛号":
      return getBoxCount(shipment) ? `1~${getBoxCount(shipment)}` : "";
    case "中文品名":
      // 产品类别
      return toDisplayText(product?.product_category);
    case "英文品名":
      // 产品英文名
      return toDisplayText(product?.product_english_name);
    case "材质":
      // 产品材质
      return toDisplayText(product?.product_material);
    case "用途":
      // 产品用途
      return toDisplayText(product?.product_usage);
    case "国外海关编码":
      // 海关编码
      return toDisplayText(product?.customs_code);
    case "产品类型":
      // 产品属性
      return toDisplayText(product?.product_attribute);
    case "单箱产品数量":
      // 装箱数量，优先使用货件保存的单箱数量
      return toNumber(shipment.pcs_per_box ?? product?.pcs_per_carton);
    case "箱数":
      return toNumber(shipment.box_count);
    case "单个产品申报单价":
      // 产品单价
      return toNumber(product?.product_unit_price);
    case "单个产品净重":
      // 单个毛重
      return toNumber(product?.single_gross_weight);
    case "总产品数量":
      return toNumber(shipment.total_qty);
    case "总申报金额":
      return toNumber(shipment.goods_value);
    case "SKU NO":
      // 产品SKU
      return toDisplayText(product?.sku);
    case "客户原单号":
      return toDisplayText(shipment.shipment_no);
    case "总件数":
      return toNumber(shipment.box_count);
    case "预约号ID":
      // 店铺ID
      return toDisplayText(store?.seller_id);
    default:
      return "";
  }
}

function getScalarValue(label: string, context: InvoiceContext) {
  return getDetailValue(label, context);
}

function getNextCell(worksheet: ExcelJS.Worksheet, cell: ExcelJS.Cell) {
  const rowNumber = Number(cell.row);
  const columnNumber = Number(cell.col);
  return worksheet.getCell(rowNumber, columnNumber + 1);
}

function getBelowCell(worksheet: ExcelJS.Worksheet, cell: ExcelJS.Cell) {
  const rowNumber = Number(cell.row);
  const columnNumber = Number(cell.col);
  return worksheet.getCell(rowNumber + 1, columnNumber);
}

function setScalarField(
  workbook: ExcelJS.Workbook,
  label: string,
  value: string | number,
) {
  workbook.worksheets.forEach((worksheet) => {
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (!isTargetLabel(cell.value, label)) return;

        getNextCell(worksheet, cell).value = value;
      });
    });
  });
}

function setDetailField(
  workbook: ExcelJS.Workbook,
  label: string,
  context: InvoiceContext,
) {
  workbook.worksheets.forEach((worksheet) => {
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (!isTargetLabel(cell.value, label)) return;

        getBelowCell(worksheet, cell).value = getDetailValue(label, context);
      });
    });
  });
}

function setFixedInvoiceCells(
  workbook: ExcelJS.Workbook,
  context: InvoiceContext,
) {
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return;

  worksheet.getCell("L18").value = toNumber(context.product?.product_unit_price);
  worksheet.getCell("M18").value = toNumber(context.product?.single_gross_weight);
}

function clearImagesInCell(worksheet: ExcelJS.Worksheet, row: number, col: number) {
  const mediaWorksheet = worksheet as ExcelJS.Worksheet & {
    _media?: Array<{
      type?: string;
      range?: {
        tl?: { row?: number; col?: number };
        br?: { row?: number; col?: number };
      };
    }>;
  };

  if (!Array.isArray(mediaWorksheet._media)) return;

  mediaWorksheet._media = mediaWorksheet._media.filter((item) => {
    if (item.type !== "image") return true;

    const startRow = Math.floor(item.range?.tl?.row ?? -1) + 1;
    const startCol = Math.floor(item.range?.tl?.col ?? -1) + 1;
    const endRow =
      Math.ceil(item.range?.br?.row ?? item.range?.tl?.row ?? -1) || startRow;
    const endCol =
      Math.ceil(item.range?.br?.col ?? item.range?.tl?.col ?? -1) || startCol;

    return !(startRow <= row && row <= endRow && startCol <= col && col <= endCol);
  });
}

async function setProductImage(
  workbook: ExcelJS.Workbook,
  context: InvoiceContext,
) {
  const imageUrl = context.product?.product_image_url?.trim();
  if (!imageUrl) return;

  const response = await fetch(imageUrl);
  if (!response.ok) return;

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const extension = contentType.includes("png")
    ? "png"
    : contentType.includes("jpg") || contentType.includes("jpeg")
      ? "jpeg"
      : contentType.includes("gif")
        ? "gif"
        : undefined;

  const imageBuffer = Buffer.from(
    await response.arrayBuffer(),
  ) as unknown as ExcelBuffer;

  workbook.worksheets.forEach((worksheet) => {
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (!isTargetLabel(cell.value, "产品高清图片")) return;

        const target = getBelowCell(worksheet, cell);
        const targetRow = Number(target.row);
        const targetColumn = Number(target.col);
        clearImagesInCell(worksheet, targetRow, targetColumn);
        target.value = "";
        worksheet.getRow(targetRow).height = Math.max(
          worksheet.getRow(targetRow).height || 0,
          80,
        );
        worksheet.getColumn(targetColumn).width = Math.max(
          worksheet.getColumn(targetColumn).width || 0,
          16,
        );

        if (!extension) {
          target.value = {
            text: "产品图片",
            hyperlink: imageUrl,
          };
          return;
        }

        const imageId = workbook.addImage({
          buffer: imageBuffer,
          extension,
        });
        worksheet.addImage(imageId, {
          tl: { col: targetColumn - 1, row: targetRow - 1 },
          ext: { width: 92, height: 72 },
        });
      });
    });
  });
}

function getSafeFileNamePart(value?: string | null) {
  return value?.trim().replace(/[\\/:*?"<>|]+/g, "_") || "";
}

function createStorageObjectName() {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  const randomId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

  return `order-invoice-${timestamp}-${randomId}.xlsx`;
}

async function loadTemplateWorkbook(templateUrl: string) {
  const response = await fetch(templateUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("日升辉下单发票模板读取失败");
  }

  const workbook = new ExcelJS.Workbook();
  const buffer = Buffer.from(
    await response.arrayBuffer(),
  ) as unknown as ExcelBuffer;
  await workbook.xlsx.load(buffer);
  return workbook;
}

export async function POST(request: Request) {
  try {
    await verifyLogisticsOperator();

    const body = (await request.json()) as RishenghuiOrderInvoiceRequestBody;
    const shipmentId = getRequiredText(body.shipmentId, "缺少货件ID");

    const adminClient = createSupabaseAdminClient();
    const { data: shipmentData, error: shipmentError } = await adminClient
      .from("shipment_records")
      .select(
        "id, order_store, logistics_provider, shipment_no, order_invoice_url, product_name, box_count, pcs_per_box, total_qty, goods_value, delivery_status, warehouse_arrived_status, overseas_warehouse_arrived_at",
      )
      .eq("status", "有效")
      .eq("id", shipmentId)
      .single();

    if (shipmentError) {
      throw shipmentError;
    }

    const shipment = shipmentData as ShipmentRow;
    if (isShipmentLocked(shipment)) {
      throw new Error("已到仓的货件不允许修改");
    }

    const logisticsProviderName = shipment.logistics_provider?.trim();
    if (!logisticsProviderName) {
      throw new Error("当前货件未设置物流商");
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
      throw new Error(`${logisticsProviderName}物流商未上传发票模板`);
    }

    const storeName = shipment.order_store?.trim();
    const { data: storeData, error: storeError } = storeName
      ? await adminClient
          .from("stores")
          .select("seller_name, seller_id, seller_code")
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
        "product_name, store_name, product_image_url, single_gross_weight, product_unit_price, pcs_per_carton, customs_code, product_category, product_usage, product_attribute, product_material, product_english_name, sku",
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
    const workbook = await loadTemplateWorkbook(templateUrl);

    setScalarField(workbook, "客户原单号", getScalarValue("客户原单号", context));
    setScalarField(workbook, "总件数", getScalarValue("总件数", context));

    DETAIL_LABELS.forEach((label) => {
      if (label !== "产品高清图片") {
        setDetailField(workbook, label, context);
      }
    });
    await setProductImage(workbook, context);
    setFixedInvoiceCells(workbook, context);

    const shipmentNo = getSafeFileNamePart(shipment.shipment_no) || shipment.id;
    const fileName = `RSH_${shipmentNo}_发票.xlsx`;
    const output = await workbook.xlsx.writeBuffer();
    const storagePath = `shipment-order-invoices/${shipment.id}/${createStorageObjectName()}`;

    const { error: uploadError } = await adminClient.storage
      .from("product-images")
      .upload(storagePath, output, {
        cacheControl: "3600",
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
    const fileUrl = publicUrlData.publicUrl;
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
      error instanceof Error ? error.message : "日升辉下单发票生成失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
