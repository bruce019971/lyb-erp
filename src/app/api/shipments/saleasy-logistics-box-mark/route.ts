import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { verifyLogisticsOperator } from "../../logistics/rishenghui/_lib";
import {
  SALEASY_PRINT_TRANSPORT_PLAN_BOX_PATH,
  SALEASY_TRANSPORT_PLAN_LIST_PATH,
  assertSaleasySuccess,
  extractFileUrl,
  extractRows,
  getFirstFieldText,
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
  toRecord,
} from "../_saleasy";

export const runtime = "nodejs";

type SaleasyLogisticsBoxMarkRequestBody = {
  shipmentId?: string;
};

type ShipmentRow = {
  id: string;
  logistics_provider: string | null;
  shipment_no: string | null;
  tracking_no: string | null;
};

type LogisticsProviderRow = {
  system_url: string | null;
  username: string | null;
  password: string | null;
};

type SaleasyPrintLabelResult = {
  payload?: unknown;
  sourceFileUrl?: string;
  buffer?: ArrayBuffer;
  contentType: string;
};

const LOG_SCOPE = "saleasy-logistics-box-mark";
const PRODUCT_IMAGES_BUCKET = "product-images";

function normalizeSaleasyFieldKey(key: string) {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

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
  return getRecursiveFieldText(row, ["id", "planid", "transportplanid"]);
}

function getSaleasyTrackingNo(row: unknown, shipmentNo: string) {
  const normalizedShipmentNo = normalizeComparableText(shipmentNo);

  for (const fieldName of [
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
  ]) {
    const value = getRecursiveFieldText(row, [fieldName]);
    if (value && normalizeComparableText(value) !== normalizedShipmentNo) {
      return value;
    }
  }

  return "";
}

function findTransportPlanRow(params: {
  rows: unknown[];
  trackingNo: string;
  shipmentNo: string;
}) {
  const normalizedTrackingNo = normalizeComparableText(params.trackingNo);
  const normalizedShipmentNo = normalizeComparableText(params.shipmentNo);
  const records = params.rows
    .map((row) => ({ row, record: toRecord(row) }))
    .filter(
      (item): item is { row: unknown; record: Record<string, unknown> } =>
        Boolean(item.record),
    );
  const matchedByTrackingNo = records.find((item) => {
    const trackingFields = [
      getFirstFieldText(item.record, ["planNo", "trackingNo", "waybillNo"]),
      getRecursiveFieldText(item.row, [
        "planno",
        "trackingno",
        "waybillno",
      ]),
    ];

    return trackingFields
      .map(normalizeComparableText)
      .some((value) => value && value === normalizedTrackingNo);
  });

  if (matchedByTrackingNo) return matchedByTrackingNo.row;

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

  return params.rows.find((row) => recordContainsText(row, params.shipmentNo));
}

async function querySaleasyTransportPlan(params: {
  baseUrl: string;
  token: string;
  trackingNo: string;
  shipmentNo: string;
}) {
  let lastRows: unknown[] = [];

  for (const query of [
    {
      label: "transport plan list response by tracking no",
      searchKey: null,
      planNoes: [params.trackingNo],
    },
    {
      label: "transport plan list response by shipment no",
      searchKey: params.shipmentNo,
      planNoes: [],
    },
  ]) {
    const result = await requestSaleasyJson<unknown>({
      baseUrl: params.baseUrl,
      path: SALEASY_TRANSPORT_PLAN_LIST_PATH,
      token: params.token,
      body: {
        operateType: 1,
        queryTimeType: 1,
        searchKey: query.searchKey,
        destinationType: 4,
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
        planNoes: query.planNoes,
      },
      logScope: LOG_SCOPE,
      label: query.label,
      fallbackError: "赛易运输计划列表查询失败",
    });
    const rows = extractRows(result);
    lastRows = rows;
    const row = findTransportPlanRow({
      rows,
      trackingNo: params.trackingNo,
      shipmentNo: params.shipmentNo,
    });
    const transportPlanId = getSaleasyTransportPlanId(row);
    const trackingNo =
      (row ? getSaleasyTrackingNo(row, params.shipmentNo) : "") ||
      params.trackingNo;

    if (row && transportPlanId) {
      return {
        row,
        rowCount: rows.length,
        transportPlanId,
        trackingNo,
      };
    }
  }

  throw new Error(
    `赛易运输计划查询结果为空或缺少计划ID：${JSON.stringify(lastRows)}`,
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

    logSaleasyResponse(LOG_SCOPE, "print label response", {
      request: {
        planId: params.planId,
      },
      status: response.status,
      statusText: response.statusText,
      headers: getResponseHeaders(response),
      payload,
    });

    if (!response.ok) {
      throw new Error(getPayloadError(payload) || "赛易物流箱唛生成失败");
    }

    assertSaleasySuccess(payload, "赛易物流箱唛生成失败");

    const sourceFileUrl = extractFileUrl(payload);
    if (!sourceFileUrl) {
      throw new Error("赛易物流箱唛接口未返回文件地址");
    }

    return {
      payload,
      sourceFileUrl: resolveSaleasyFileUrl(params.baseUrl, sourceFileUrl),
      contentType: "application/pdf",
    };
  }

  logSaleasyResponse(LOG_SCOPE, "print label binary response", {
    request: {
      planId: params.planId,
    },
    status: response.status,
    statusText: response.statusText,
    headers: getResponseHeaders(response),
  });

  if (!response.ok) {
    throw new Error("赛易物流箱唛生成失败");
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
    "赛易物流箱唛接口未返回文件地址",
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
    throw new Error("赛易物流箱唛文件下载失败");
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

    const body = (await request.json()) as SaleasyLogisticsBoxMarkRequestBody;
    const shipmentId = getRequiredText(body.shipmentId, "缺少货件ID");
    const adminClient = createSupabaseAdminClient();
    const { data: shipmentData, error: shipmentError } = await adminClient
      .from("shipment_records")
      .select("id, logistics_provider, shipment_no, tracking_no")
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

    const shipmentNo = getRequiredText(
      shipment.shipment_no,
      "当前货件缺少货件号",
    );
    const trackingNo = getRequiredText(
      shipment.tracking_no,
      "当前货件缺少运单编号",
    );
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
    const token = await loginSaleasy({
      baseUrl,
      username,
      password,
      logScope: LOG_SCOPE,
    });
    const transportPlanResult = await querySaleasyTransportPlan({
      baseUrl,
      token,
      trackingNo,
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
      fileurl: storedFileUrl,
      sourceFileUrl: labelResult.sourceFileUrl ?? "",
      queried: transportPlanResult,
      printed: labelResult.payload ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "赛易物流箱唛生成失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
