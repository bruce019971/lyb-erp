import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { verifyLogisticsOperator } from "../../logistics/rishenghui/_lib";
import {
  SALEASY_COMMON_ADDRESS_PATH,
  SALEASY_CONFIRM_TRANSPORT_PLAN_PATH,
  SALEASY_CREATE_TRANSPORT_PLAN_PATH,
  SALEASY_PLATFORM_ADDRESS_PATH,
  SALEASY_PRINT_TRANSPORT_PLAN_BOX_PATH,
  SALEASY_PRODUCT_SEARCH_PATH,
  SALEASY_SET_TRANSPORT_INFO_PATH,
  SALEASY_TRANSPORT_PLAN_DETAIL_PATH,
  SALEASY_TRANSPORT_PLAN_FEE_DETAIL_PATH,
  SALEASY_TRANSPORT_PLAN_LIST_PATH,
  SALEASY_TRANSPORT_PLAN_LOGISTICS_PATH,
  assertSaleasySuccess,
  extractFileUrl,
  extractId,
  extractRows,
  getFirstFieldNumber,
  getFirstFieldText,
  getOptionalNumber,
  getOptionalText,
  getPayloadError,
  getRequiredText,
  getResponseHeaders,
  joinSaleasyUrl,
  logSaleasyResponse,
  loginSaleasy,
  normalizeComparableText,
  normalizeSaleasyBaseUrl,
  recordContainsText,
  requestSaleasyJson,
  sleep,
  toRecord,
} from "../_saleasy";

export const runtime = "nodejs";

type SaleasyOrderSubmitRequestBody = {
  shipmentId?: string;
};

type ShipmentRow = {
  id: string;
  order_store: string | null;
  logistics_provider: string | null;
  shipment_no: string | null;
  tracking_no: string | null;
  logistics_box_mark_url: string | null;
  product_name: string | null;
  box_count: number | null;
  pcs_per_box: number | null;
  total_qty: number | null;
};

type StoreRow = {
  seller_name: string | null;
  seller_id: string | null;
};

type ProductRow = {
  product_name: string | null;
  store_name: string | null;
  carton_spec: string | null;
  single_gross_weight: number | null;
  pcs_per_carton: number | null;
  product_unit_price: number | null;
  customs_code: string | null;
  product_category: string | null;
  product_usage: string | null;
  product_attribute: string | null;
  product_material: string | null;
  product_english_name: string | null;
  sku: string | null;
};

type LogisticsProviderRow = {
  system_url: string | null;
  username: string | null;
  password: string | null;
};

type SaleasyAddressPayload = {
  id: unknown;
  name: unknown;
  countryId: unknown;
  provinceId: unknown;
  cityId: unknown;
  countyId?: unknown;
  address: unknown;
  address2?: unknown;
  postCode: unknown;
};

type SaleasyPlanBoxPayload = {
  selfBoxNo: null;
  containerLength: number;
  containerWidth: number;
  containerHeight: number;
  containerWeight: number;
  detailProducts: Array<{
    productId: string;
    productCount: number;
  }>;
};

type SaleasyPrintLabelResult = {
  payload?: unknown;
  sourceFileUrl?: string;
  buffer?: ArrayBuffer;
  contentType: string;
};

const LOG_SCOPE = "saleasy-order-submit";
const MERCADO_LIBRE_DESTINATION_TYPE = 4;
const MERCADO_LIBRE_PLATFORM = 2;
const TARGET_WAREHOUSE_CODE = "MXRC03";
const TARGET_LOGISTICS_CODE = "MXSEATPW";
const PRODUCT_IMAGES_BUCKET = "product-images";
const TRANSPORT_PLAN_QUERY_ATTEMPTS = 8;
const TRANSPORT_PLAN_QUERY_DELAY_MS = 2500;

function getPositiveInteger(value: unknown, message: string) {
  const numberValue = getOptionalNumber(value);

  if (numberValue === undefined || numberValue <= 0) {
    throw new Error(message);
  }

  return Math.floor(numberValue);
}

function getPositiveNumber(value: unknown, message: string) {
  const numberValue = getOptionalNumber(value);

  if (numberValue === undefined || numberValue <= 0) {
    throw new Error(message);
  }

  return numberValue;
}

function getFirstFieldValue(
  record: Record<string, unknown>,
  fieldNames: string[],
) {
  for (const fieldName of fieldNames) {
    const value = record[fieldName];
    if (getOptionalText(value) || getOptionalNumber(value) !== undefined) {
      return value;
    }
  }

  return undefined;
}

function getRequiredFieldValue(
  record: Record<string, unknown>,
  fieldNames: string[],
  message: string,
) {
  const value = getFirstFieldValue(record, fieldNames);
  if (value === undefined || value === null || !getOptionalText(value)) {
    throw new Error(message);
  }

  return value;
}

function parseCartonSpec(value?: string | null) {
  const numbers = (value ?? "")
    .match(/\d+(?:\.\d+)?/g)
    ?.map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);

  if (!numbers || numbers.length < 3) {
    throw new Error("产品箱规缺失或格式不正确，无法下单赛易");
  }

  const [containerLength, containerWidth, containerHeight] = numbers
    .slice(0, 3)
    .sort((left, right) => right - left);

  return {
    containerLength,
    containerWidth,
    containerHeight,
  };
}

function kgToGrams(value: number) {
  return Math.max(1, Math.round(value * 1000));
}

function getSaleasyRecordId(record: Record<string, unknown>) {
  return getFirstFieldText(record, [
    "id",
    "productId",
    "warehouseId",
    "addressId",
    "planId",
  ]);
}

function findWarehouse(rows: unknown[], code: string) {
  const normalizedCode = normalizeComparableText(code);

  return rows
    .map(toRecord)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .find((item) => {
      const searchable = getFirstFieldText(item, [
        "name",
        "warehouseNo",
        "warehouseCode",
        "warehouseName",
        "code",
        "no",
      ]);

      return normalizeComparableText(searchable).includes(normalizedCode);
    });
}

function findSaleasyProduct(rows: unknown[], productName: string) {
  const normalizedName = normalizeComparableText(productName);
  const records = rows
    .map(toRecord)
    .filter((item): item is Record<string, unknown> => Boolean(item));

  return (
    records.find((item) => {
      const candidate = getFirstFieldText(item, [
        "productName",
        "name",
        "productNo",
        "seSku",
      ]);

      return normalizeComparableText(candidate) === normalizedName;
    }) ??
    records.find((item) => recordContainsText(item, productName)) ??
    records[0]
  );
}

function buildSaleasyAddress(
  row: Record<string, unknown>,
): SaleasyAddressPayload {
  return {
    id: getRequiredFieldValue(row, ["id"], "赛易常用地址缺少ID"),
    name: getRequiredFieldValue(
      row,
      ["contactName", "commonAddressName", "name"],
      "赛易常用地址缺少名称",
    ),
    countryId: getRequiredFieldValue(row, ["countryId"], "赛易常用地址缺少国家"),
    provinceId: getRequiredFieldValue(
      row,
      ["provinceId"],
      "赛易常用地址缺少省份",
    ),
    cityId: getRequiredFieldValue(row, ["cityId"], "赛易常用地址缺少城市"),
    countyId: getFirstFieldValue(row, ["countyId"]),
    address: getRequiredFieldValue(row, ["address"], "赛易常用地址缺少详细地址"),
    address2: getFirstFieldValue(row, ["address2"]),
    postCode: getRequiredFieldValue(row, ["postCode"], "赛易常用地址缺少邮编"),
  };
}

function buildPlanBoxes(params: {
  boxCount: number;
  dimensions: ReturnType<typeof parseCartonSpec>;
  boxGrossWeightKg: number;
  productId: string;
  pcsPerBox: number;
}): SaleasyPlanBoxPayload[] {
  return Array.from({ length: params.boxCount }, () => ({
    selfBoxNo: null,
    containerLength: params.dimensions.containerLength,
    containerWidth: params.dimensions.containerWidth,
    containerHeight: params.dimensions.containerHeight,
    containerWeight: kgToGrams(params.boxGrossWeightKg),
    detailProducts: [
      {
        productId: params.productId,
        productCount: params.pcsPerBox,
      },
    ],
  }));
}

function getLogisticsBaseInfo(value: unknown) {
  const record = toRecord(value);
  if (!record) return null;

  return toRecord(record.logisticsBaseInfo) ?? record;
}

function findLogisticsScheme(rows: unknown[], code: string) {
  const normalizedCode = normalizeComparableText(code);

  return rows
    .map((item) => ({
      raw: item,
      base: getLogisticsBaseInfo(item),
    }))
    .filter(
      (item): item is { raw: unknown; base: Record<string, unknown> } =>
        Boolean(item.base),
    )
    .find((item) => {
      const logisticsCode = getFirstFieldText(item.base, ["code"]);
      const logisticsName = getFirstFieldText(item.base, ["name"]);

      return (
        normalizeComparableText(logisticsCode) === normalizedCode ||
        normalizeComparableText(logisticsName).includes("墨西哥联运标准线")
      );
    });
}

function getNestedRecord(
  record: Record<string, unknown> | null,
  fieldName: string,
) {
  return toRecord(record?.[fieldName]);
}

function getCustomsInfo(row: Record<string, unknown>) {
  return toRecord(row.customsInfo);
}

function getFirstNonEmptyRows(values: unknown[]) {
  for (const value of values) {
    const rows = extractRows(value);
    if (rows.length > 0) return rows;
  }

  return [];
}

function buildSetTransportPlanDetails(detail: unknown, product: ProductRow) {
  const detailRecord = toRecord(detail);
  const planBoxInfo = getNestedRecord(detailRecord, "planBoxInfo");
  const boxRows = getFirstNonEmptyRows([
    planBoxInfo?.transportPlanBoxData,
    planBoxInfo,
    detailRecord?.transportPlanBoxData,
  ]);

  if (!boxRows.length) {
    throw new Error("赛易运输计划详情未返回箱子明细");
  }

  return boxRows.map((boxRow, boxIndex) => {
    const boxRecord = toRecord(boxRow);
    if (!boxRecord) {
      throw new Error("赛易运输计划箱子明细格式异常");
    }

    const detailId = getFirstFieldText(boxRecord, [
      "planDetailId",
      "detailId",
      "id",
    ]);
    if (!detailId) {
      throw new Error(`赛易运输计划第 ${boxIndex + 1} 箱缺少明细ID`);
    }

    const productRows = extractRows(boxRecord.productInfos);
    return {
      detailId,
      productInfos: productRows
        .map(toRecord)
        .filter((item): item is Record<string, unknown> => Boolean(item))
        .map((productRow, productIndex) => {
          const customsInfo = getCustomsInfo(productRow);
          const boxProductRlId = getFirstFieldText(productRow, ["id"]);
          if (!boxProductRlId) {
            throw new Error(
              `赛易运输计划第 ${boxIndex + 1} 箱第 ${
                productIndex + 1
              } 个产品缺少关联ID`,
            );
          }

          return {
            boxProductRlId,
            brandCName:
              getOptionalText(customsInfo?.brandCName) ||
              getOptionalText(product.product_category),
            brandEnName:
              getOptionalText(customsInfo?.brandEnName) ||
              getOptionalText(product.product_english_name),
            hsCode:
              getOptionalText(customsInfo?.hsCode) ||
              getOptionalText(product.customs_code),
            declarePrice:
              getOptionalNumber(customsInfo?.totalPrice) ??
              getOptionalNumber(product.product_unit_price) ??
              null,
            currencyId: getOptionalText(customsInfo?.currencyId) || "2",
          };
        }),
    };
  });
}

function normalizeSaleasyFieldKey(key: string) {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

const TRANSPORT_PLAN_ID_FIELDS = [
  "id",
  "planid",
  "transportplanid",
] as const;

const TRACKING_FIELD_PRIORITY = [
  "planno",
  "transportplanno",
  "transportplannumber",
  "transportationplanno",
  "transferorderno",
  "trackingno",
  "trackingnumber",
  "waybillno",
  "waybillnumber",
  "logisticsno",
  "logisticsnumber",
  "carriertrackingno",
  "carrierwaybillno",
  "supplierorderno",
] as const;

function getRecursiveFieldText(
  value: unknown,
  normalizedFieldNames: readonly string[],
  depth = 0,
): string {
  if (!value || depth > 4) return "";

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = getRecursiveFieldText(
        item,
        normalizedFieldNames,
        depth + 1,
      );
      if (result) return result;
    }

    return "";
  }

  const record = toRecord(value);
  if (!record) return "";

  for (const [key, item] of Object.entries(record)) {
    if (!normalizedFieldNames.includes(normalizeSaleasyFieldKey(key))) {
      continue;
    }

    const text = getOptionalText(item);
    if (text) return text;
  }

  for (const item of Object.values(record)) {
    const result = getRecursiveFieldText(
      item,
      normalizedFieldNames,
      depth + 1,
    );
    if (result) return result;
  }

  return "";
}

function getSaleasyTransportPlanId(row: unknown) {
  return getRecursiveFieldText(row, TRANSPORT_PLAN_ID_FIELDS);
}

function getSaleasyTrackingNo(row: unknown, shipmentNo: string) {
  const normalizedShipmentNo = normalizeComparableText(shipmentNo);

  for (const fieldName of TRACKING_FIELD_PRIORITY) {
    const value = getRecursiveFieldText(row, [fieldName]);
    if (value && normalizeComparableText(value) !== normalizedShipmentNo) {
      return value;
    }
  }

  return "";
}

function findTransportPlanRow(params: {
  rows: unknown[];
  planId: string;
  shipmentNo: string;
}) {
  const normalizedPlanId = normalizeComparableText(params.planId);
  const normalizedShipmentNo = normalizeComparableText(params.shipmentNo);
  const records = params.rows
    .map((row) => ({ row, record: toRecord(row) }))
    .filter(
      (item): item is { row: unknown; record: Record<string, unknown> } =>
        Boolean(item.record),
    );
  const matchedByPlanId = records.find((item) => {
    const directId = getFirstFieldText(item.record, ["id", "planId"]);
    const recursiveId = getSaleasyTransportPlanId(item.row);

    return [directId, recursiveId]
      .map(normalizeComparableText)
      .some((value) => value && value === normalizedPlanId);
  });

  if (matchedByPlanId) return matchedByPlanId.row;

  const matchedByShipmentNo = records.find((item) => {
    const shipmentFields = [
      getFirstFieldText(item.record, ["mcdShipmentId", "planName"]),
      getRecursiveFieldText(item.row, ["mcdshipmentid", "planname"]),
    ];

    return shipmentFields
      .map(normalizeComparableText)
      .some((value) => value && value === normalizedShipmentNo);
  });

  if (matchedByShipmentNo) return matchedByShipmentNo.row;

  const matchedRows = params.rows.filter((row) =>
    recordContainsText(row, params.shipmentNo),
  );
  const candidateRows =
    matchedRows.length > 0
      ? matchedRows
      : params.rows.length === 1
        ? params.rows
        : [];

  return candidateRows[0];
}

async function querySaleasyTransportPlan(params: {
  baseUrl: string;
  token: string;
  planId: string;
  shipmentNo: string;
}) {
  let lastRows: unknown[] = [];

  for (
    let attempt = 1;
    attempt <= TRANSPORT_PLAN_QUERY_ATTEMPTS;
    attempt += 1
  ) {
    const result = await requestSaleasyJson<unknown>({
      baseUrl: params.baseUrl,
      path: SALEASY_TRANSPORT_PLAN_LIST_PATH,
      token: params.token,
      body: {
        operateType: 1,
        queryTimeType: 1,
        searchKey: params.shipmentNo,
        destinationType: MERCADO_LIBRE_DESTINATION_TYPE,
        logisticsScheme: null,
        isInsure: null,
        fromCountryId: null,
        fromCityId: null,
        toCountryId: null,
        toCityId: null,
        startCreationTime: null,
        endCreationTime: null,
        planStatuses: [],
        isRefund: null,
        isLoseMoney: null,
        inOrOutWarehouseNo: null,
        currentIndex: 1,
        skipCount: 0,
        isNeedTransportBoxesTotal: true,
        maxResultCount: 10,
        sorting: null,
        planNoes: [],
      },
      logScope: LOG_SCOPE,
      label: `transport plan list response ${attempt}`,
      fallbackError: "赛易运输计划列表查询失败",
    });
    const rows = extractRows(result);
    lastRows = rows;
    const row = findTransportPlanRow({
      rows,
      planId: params.planId,
      shipmentNo: params.shipmentNo,
    });
    const transportPlanId = getSaleasyTransportPlanId(row) || params.planId;
    const trackingNo = getSaleasyTrackingNo(row, params.shipmentNo);

    if (row && transportPlanId && trackingNo) {
      return {
        attempts: attempt,
        rowCount: rows.length,
        row,
        trackingNo,
        transportPlanId,
      };
    }

    if (attempt < TRANSPORT_PLAN_QUERY_ATTEMPTS) {
      await sleep(TRANSPORT_PLAN_QUERY_DELAY_MS);
    }
  }

  throw new Error(
    `赛易运输计划查询结果为空或缺少运单编号：${JSON.stringify(lastRows)}`,
  );
}

function resolveSaleasyFileUrl(baseUrl: string, fileUrl: string) {
  const normalized = fileUrl.trim().replace(/\\/g, "/");

  if (/^\/\//.test(normalized)) return `https:${normalized}`;
  if (/^https?:\/\//i.test(normalized)) return normalized;

  return new URL(normalized, `${baseUrl}/`).toString();
}

async function requestSaleasyPrintLabel(params: {
  baseUrl: string;
  token: string;
  planId: string;
}): Promise<SaleasyPrintLabelResult> {
  const response = await fetch(
    joinSaleasyUrl(params.baseUrl, SALEASY_PRINT_TRANSPORT_PLAN_BOX_PATH, {
      id: params.planId,
    }),
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.token}`,
        "custom-culture": "zh-CN",
      },
      cache: "no-store",
    },
  );
  const contentType =
    response.headers.get("content-type") || "application/pdf";

  if (contentType.toLowerCase().includes("json")) {
    const payload = await response.json().catch(() => null);

    logSaleasyResponse(LOG_SCOPE, "print waybill response", {
      request: {
        planId: params.planId,
      },
      status: response.status,
      statusText: response.statusText,
      headers: getResponseHeaders(response),
      payload,
    });

    if (!response.ok) {
      throw new Error(getPayloadError(payload) || "赛易物流标签生成失败");
    }

    assertSaleasySuccess(payload, "赛易物流标签生成失败");

    const sourceFileUrl = extractFileUrl(payload);
    if (!sourceFileUrl) {
      throw new Error("赛易物流标签接口未返回文件地址");
    }

    return {
      payload,
      sourceFileUrl: resolveSaleasyFileUrl(params.baseUrl, sourceFileUrl),
      contentType: "application/pdf",
    };
  }

    logSaleasyResponse(LOG_SCOPE, "print waybill binary response", {
      request: {
        planId: params.planId,
      },
      status: response.status,
    statusText: response.statusText,
    headers: getResponseHeaders(response),
  });

  if (!response.ok) {
    throw new Error("赛易物流标签生成失败");
  }

  return {
    buffer: await response.arrayBuffer(),
    contentType,
  };
}

function getLabelExtension(contentType: string, fileUrl?: string) {
  const normalizedContentType = contentType.toLowerCase();

  if (normalizedContentType.includes("png")) return "png";
  if (
    normalizedContentType.includes("jpeg") ||
    normalizedContentType.includes("jpg")
  ) {
    return "jpg";
  }
  if (normalizedContentType.includes("excel") || fileUrl?.endsWith(".xlsx")) {
    return "xlsx";
  }

  return "pdf";
}

function getLabelStoragePath(params: {
  shipmentId: string;
  trackingNo: string;
  contentType: string;
  fileUrl?: string;
}) {
  const extension = getLabelExtension(params.contentType, params.fileUrl);

  return `shipment-logistics-box-marks/${params.shipmentId}/${params.trackingNo}-${randomUUID()}.${extension}`;
}

async function uploadLabelBufferToStorage(params: {
  adminClient: ReturnType<typeof createSupabaseAdminClient>;
  shipmentId: string;
  trackingNo: string;
  buffer: ArrayBuffer;
  contentType: string;
  fileUrl?: string;
}) {
  const storagePath = getLabelStoragePath({
    shipmentId: params.shipmentId,
    trackingNo: params.trackingNo,
    contentType: params.contentType,
    fileUrl: params.fileUrl,
  });
  const { error: uploadError } = await params.adminClient.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(storagePath, params.buffer, {
      cacheControl: "0",
      contentType: params.contentType,
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = params.adminClient.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(storagePath);

  return data.publicUrl;
}

async function uploadSaleasyLabelToStorage(params: {
  adminClient: ReturnType<typeof createSupabaseAdminClient>;
  shipmentId: string;
  trackingNo: string;
  labelResult: SaleasyPrintLabelResult;
}) {
  if (params.labelResult.buffer) {
    return uploadLabelBufferToStorage({
      adminClient: params.adminClient,
      shipmentId: params.shipmentId,
      trackingNo: params.trackingNo,
      buffer: params.labelResult.buffer,
      contentType: params.labelResult.contentType,
    });
  }

  const sourceFileUrl = getRequiredText(
    params.labelResult.sourceFileUrl,
    "赛易物流标签接口未返回文件地址",
  );
  const response = await fetch(sourceFileUrl, { cache: "no-store" });
  const contentType =
    response.headers.get("content-type") ||
    params.labelResult.contentType ||
    "application/pdf";

  logSaleasyResponse(LOG_SCOPE, "download label response", {
    fileUrl: sourceFileUrl,
    status: response.status,
    statusText: response.statusText,
    headers: getResponseHeaders(response),
  });

  if (!response.ok) {
    throw new Error("赛易物流标签文件下载失败");
  }

  return uploadLabelBufferToStorage({
    adminClient: params.adminClient,
    shipmentId: params.shipmentId,
    trackingNo: params.trackingNo,
    buffer: await response.arrayBuffer(),
    contentType,
    fileUrl: sourceFileUrl,
  });
}

export async function POST(request: Request) {
  try {
    await verifyLogisticsOperator();

    const body = (await request.json()) as SaleasyOrderSubmitRequestBody;
    const shipmentId = getRequiredText(body.shipmentId, "缺少货件ID");
    const adminClient = createSupabaseAdminClient();
    const { data: shipmentData, error: shipmentError } = await adminClient
      .from("shipment_records")
      .select(
        "id, order_store, logistics_provider, shipment_no, tracking_no, logistics_box_mark_url, product_name, box_count, pcs_per_box, total_qty",
      )
      .eq("status", "有效")
      .eq("id", shipmentId)
      .single();

    if (shipmentError) {
      throw shipmentError;
    }

    const shipment = shipmentData as ShipmentRow;
    if (shipment.logistics_provider?.trim() !== "赛易") {
      throw new Error("当前货件物流商不是赛易");
    }

    if (shipment.tracking_no?.trim()) {
      throw new Error("当前货件已存在运单编号，不能重复下单");
    }

    const shipmentNo = getRequiredText(shipment.shipment_no, "当前货件缺少货件号");
    const productName = getRequiredText(
      shipment.product_name,
      "当前货件缺少产品名称",
    );
    const storeName = getRequiredText(
      shipment.order_store,
      "当前货件缺少下单店铺",
    );
    const boxCount = getPositiveInteger(shipment.box_count, "当前货件箱数无效");
    const { data: logisticsData, error: logisticsError } = await adminClient
      .from("logistics_providers")
      .select("system_url, username, password")
      .eq("provider_name", "赛易")
      .single();

    if (logisticsError) {
      throw logisticsError;
    }

    const logisticsProvider = logisticsData as LogisticsProviderRow;
    const baseUrl = normalizeSaleasyBaseUrl(logisticsProvider.system_url);
    const username = getRequiredText(
      logisticsProvider.username,
      "赛易物流商用户名未配置",
    );
    const password = getRequiredText(
      logisticsProvider.password,
      "赛易物流商密码未配置",
    );
    const { data: storeData, error: storeError } = await adminClient
      .from("stores")
      .select("seller_name, seller_id")
      .eq("seller_name", storeName)
      .maybeSingle();

    if (storeError) {
      throw storeError;
    }

    const store = storeData as StoreRow | null;
    const sellerId = getRequiredText(
      store?.seller_id,
      "下单店铺缺少Seller ID",
    );
    const { data: productData, error: productError } = await adminClient
      .from("products")
      .select(
        "product_name, store_name, carton_spec, single_gross_weight, pcs_per_carton, product_unit_price, customs_code, product_category, product_usage, product_attribute, product_material, product_english_name, sku",
      )
      .eq("status", "有效")
      .eq("product_name", productName)
      .eq("store_name", storeName)
      .limit(1)
      .maybeSingle();

    if (productError) {
      throw productError;
    }

    if (!productData) {
      throw new Error("未找到当前货件对应的有效产品");
    }

    const product = productData as ProductRow;
    const dimensions = parseCartonSpec(product.carton_spec);
    const pcsPerBox = getPositiveInteger(
      shipment.pcs_per_box ?? product.pcs_per_carton,
      "当前货件装箱数量无效",
    );
    const singleGrossWeight = getPositiveNumber(
      product.single_gross_weight,
      "产品单个毛重缺失，无法下单赛易",
    );
    const boxGrossWeightKg = singleGrossWeight * pcsPerBox;
    const token = await loginSaleasy({
      baseUrl,
      username,
      password,
      logScope: LOG_SCOPE,
    });
    const warehouseResult = await requestSaleasyJson<unknown>({
      baseUrl,
      path: SALEASY_PLATFORM_ADDRESS_PATH,
      token,
      body: { platform: MERCADO_LIBRE_PLATFORM },
      logScope: LOG_SCOPE,
      label: "platform address response",
      fallbackError: "赛易FBM仓库列表获取失败",
    });
    const warehouse = findWarehouse(extractRows(warehouseResult), TARGET_WAREHOUSE_CODE);
    if (!warehouse) {
      throw new Error(`赛易未找到FBM仓库代码 ${TARGET_WAREHOUSE_CODE}`);
    }

    const warehouseId = getRequiredText(
      getSaleasyRecordId(warehouse),
      `赛易FBM仓库 ${TARGET_WAREHOUSE_CODE} 缺少ID`,
    );
    const commonAddressResult = await requestSaleasyJson<unknown>({
      baseUrl,
      path: SALEASY_COMMON_ADDRESS_PATH,
      token,
      body: {},
      logScope: LOG_SCOPE,
      label: "common address response",
      fallbackError: "赛易常用地址获取失败",
    });
    const commonAddress = extractRows(commonAddressResult)
      .map(toRecord)
      .find((item): item is Record<string, unknown> => Boolean(item));

    if (!commonAddress) {
      throw new Error("赛易未配置常用地址");
    }

    const fromAddress = buildSaleasyAddress(commonAddress);
    const productSearchResult = await requestSaleasyJson<unknown>({
      baseUrl,
      path: SALEASY_PRODUCT_SEARCH_PATH,
      token,
      body: {
        searchKey: productName,
        skipCount: 0,
        maxResultCount: 5,
      },
      logScope: LOG_SCOPE,
      label: "product search response",
      fallbackError: "赛易产品搜索失败",
    });
    const saleasyProduct = findSaleasyProduct(
      extractRows(productSearchResult),
      productName,
    );

    if (!saleasyProduct) {
      throw new Error(`赛易系统中未找到产品：${productName}`);
    }

    const saleasyProductId = getRequiredText(
      getSaleasyRecordId(saleasyProduct),
      `赛易产品 ${productName} 缺少ID`,
    );
    const transportPlanDetails = buildPlanBoxes({
      boxCount,
      dimensions,
      boxGrossWeightKg,
      productId: saleasyProductId,
      pcsPerBox,
    });
    const createPlanResult = await requestSaleasyJson<unknown>({
      baseUrl,
      path: SALEASY_CREATE_TRANSPORT_PLAN_PATH,
      token,
      body: {
        planName: shipmentNo,
        destinationType: MERCADO_LIBRE_DESTINATION_TYPE,
        toWarehouseId: warehouseId,
        toWarehouseType: null,
        transportPlanDetails,
        fromAddress,
        toAddress: {},
        mcdSellerId: sellerId,
        mcdShipmentId: shipmentNo,
      },
      logScope: LOG_SCOPE,
      label: "create transport plan response",
      fallbackError: "赛易创建运输计划失败",
    });
    const planId = getRequiredText(
      extractId(createPlanResult),
      "赛易创建运输计划接口未返回计划ID",
    );
    const planDetail = await requestSaleasyJson<unknown>({
      baseUrl,
      path: SALEASY_TRANSPORT_PLAN_DETAIL_PATH,
      token,
      body: { id: planId },
      logScope: LOG_SCOPE,
      label: "transport plan detail response",
      fallbackError: "赛易运输计划详情获取失败",
    });
    const logisticsResult = await requestSaleasyJson<unknown>({
      baseUrl,
      path: SALEASY_TRANSPORT_PLAN_LOGISTICS_PATH,
      token,
      body: { planId },
      logScope: LOG_SCOPE,
      label: "transport plan logistics response",
      fallbackError: "赛易物流方案获取失败",
    });
    const logisticsScheme = findLogisticsScheme(
      extractRows(logisticsResult),
      TARGET_LOGISTICS_CODE,
    );

    if (!logisticsScheme) {
      throw new Error(
        `赛易未找到物流方案：墨西哥联运标准线 / ${TARGET_LOGISTICS_CODE}`,
      );
    }

    const logisticsId = getRequiredText(
      getSaleasyRecordId(logisticsScheme.base),
      `赛易物流方案 ${TARGET_LOGISTICS_CODE} 缺少ID`,
    );
    const deliveryType =
      getFirstFieldNumber(logisticsScheme.base, ["deliveryType"]) ??
      getFirstFieldNumber(toRecord(logisticsScheme.raw) ?? {}, [
        "deliveryType",
        "deliveryWay",
      ]);

    const feeDetailResult = await requestSaleasyJson<unknown>({
      baseUrl,
      path: SALEASY_TRANSPORT_PLAN_FEE_DETAIL_PATH,
      token,
      body: {
        planId,
        logisticsId,
        deliveryType,
        truckApiLogistics: null,
      },
      logScope: LOG_SCOPE,
      label: "transport plan fee detail response",
      fallbackError: "赛易物流方案费用详情获取失败",
    });
    const effectiveLogisticsBase =
      getLogisticsBaseInfo(feeDetailResult) ?? logisticsScheme.base;
    const effectiveLogisticsId =
      getSaleasyRecordId(effectiveLogisticsBase) || logisticsId;
    const setTransportInfoResult = await requestSaleasyJson<unknown>({
      baseUrl,
      path: SALEASY_SET_TRANSPORT_INFO_PATH,
      token,
      body: {
        id: planId,
        customsDeclarationUrl: null,
        contractUrl: null,
        invoiceUrl: null,
        packingUrl: null,
        integrationUrl: null,
        logisticsId: effectiveLogisticsId,
        isChooseDdp: false,
        isChooseSign: false,
        signatureType: null,
        vatCode: null,
        isInsure: false,
        transportPlanDetails: buildSetTransportPlanDetails(planDetail, product),
        isUploadHsInfo: false,
        truckApiLogistics: null,
      },
      logScope: LOG_SCOPE,
      label: "set transport info response",
      fallbackError: "赛易设置运输信息失败",
    });
    const confirmPlanId = extractId(setTransportInfoResult) || planId;
    const confirmResult = await requestSaleasyJson<unknown>({
      baseUrl,
      path: SALEASY_CONFIRM_TRANSPORT_PLAN_PATH,
      token,
      body: {
        id: confirmPlanId,
        isDoorTook: false,
        doorLinkUserName: "",
        doorContactPhone: "",
        receiptUserName: "Mercado Libre",
        receiptContactPhone: "",
        receiptPhoneCountryId: "",
        saveMode: 2,
      },
      logScope: LOG_SCOPE,
      label: "confirm transport plan response",
      fallbackError: "赛易确认下单失败",
    });
    const transportPlanResult = await querySaleasyTransportPlan({
      baseUrl,
      token,
      planId,
      shipmentNo,
    });
    const labelResult = await requestSaleasyPrintLabel({
      baseUrl,
      token,
      planId: transportPlanResult.transportPlanId,
    });
    const storedFileUrl = await uploadSaleasyLabelToStorage({
      adminClient,
      shipmentId: shipment.id,
      trackingNo: transportPlanResult.trackingNo,
      labelResult,
    });
    const { data: updatedShipment, error: updateError } = await adminClient
      .from("shipment_records")
      .update({
        tracking_no: transportPlanResult.trackingNo,
        logistics_box_mark_url: storedFileUrl,
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
      trackingNo: transportPlanResult.trackingNo,
      waybillId: transportPlanResult.transportPlanId,
      planId,
      confirmPlanId,
      fileurl: storedFileUrl,
      sourceFileUrl: labelResult.sourceFileUrl ?? "",
      created: createPlanResult,
      feeDetail: feeDetailResult,
      confirmed: confirmResult,
      queried: transportPlanResult,
      printed: labelResult.payload ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "赛易物流下单失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
