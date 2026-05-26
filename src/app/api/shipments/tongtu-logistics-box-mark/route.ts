import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { verifyLogisticsOperator } from "../../logistics/rishenghui/_lib";
import {
  assertTongtuSuccess,
  buildTongtuHeaders,
  createTongtuId,
  getOptionalText,
  getPayloadError,
  getRequiredText,
  getResponseHeaders,
  joinTongtuUrl,
  logTongtuResponse,
  loginTongtu,
  normalizeBaseUrl,
  queryTongtuWaybill,
  type TongtuApiResponse,
} from "../_tongtu";

export const runtime = "nodejs";

type TongtuLogisticsBoxMarkRequestBody = {
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

type TongtuOrderFileData = {
  url?: unknown;
  fileUrl?: unknown;
  downloadUrl?: unknown;
};

const LOG_SCOPE = "tongtu-logistics-box-mark";
const TONGTU_ORDER_FILE_PATH_PREFIX =
  "/itdida-api/flash/waybill/order/files";
const TONGTU_SYSTEM_LABEL_TYPE = 1;
const TONGTU_SINGLE_LABEL_TYPE = 8;
const PRODUCT_IMAGES_BUCKET = "product-images";

function getTongtuFileUrl(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";

  const result = payload as TongtuApiResponse<TongtuOrderFileData | string>;
  if (typeof result.data === "string") return result.data.trim();

  return (
    getOptionalText(result.data?.url) ||
    getOptionalText(result.data?.fileUrl) ||
    getOptionalText(result.data?.downloadUrl)
  );
}

function fixTongtuOssUrl(fileUrl: string) {
  const trimmed = fileUrl.trim();
  if (
    /^http:\/\//i.test(trimmed) &&
    trimmed.toLowerCase().includes("aliyuncs.com")
  ) {
    return `https://${trimmed.slice(7)}`;
  }

  return trimmed;
}

async function requestTongtuOrderFile(params: {
  baseUrl: string;
  token: string;
  waybillId: string;
  fileType: number;
  singlePrintType?: number;
  websocketToken: string;
  visitorId: string;
}) {
  const path = `${TONGTU_ORDER_FILE_PATH_PREFIX}/${encodeURIComponent(
    params.waybillId,
  )}`;
  const query = new URLSearchParams({
    type: String(params.fileType),
    isPrint: "false",
    singlePrintType: String(params.singlePrintType ?? 0),
  }).toString();
  const response = await fetch(joinTongtuUrl(params.baseUrl, `${path}?${query}`), {
    method: "GET",
    headers: buildTongtuHeaders({
      baseUrl: params.baseUrl,
      token: params.token,
      path,
      query,
      websocketToken: params.websocketToken,
      visitorId: params.visitorId,
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | TongtuApiResponse<TongtuOrderFileData | string>
    | null;

  logTongtuResponse(LOG_SCOPE, "order file response", {
    request: {
      waybillId: params.waybillId,
      fileType: params.fileType,
      singlePrintType: params.singlePrintType ?? 0,
    },
    status: response.status,
    statusText: response.statusText,
    headers: getResponseHeaders(response),
    payload,
  });

  if (!response.ok) {
    throw new Error(getPayloadError(payload) || "通途运单标签生成失败");
  }

  assertTongtuSuccess(payload, "通途运单标签生成失败");

  const fileUrl = getTongtuFileUrl(payload);
  if (!fileUrl) {
    throw new Error("通途运单标签接口未返回文件地址");
  }

  return {
    payload,
    fileUrl: fixTongtuOssUrl(fileUrl),
  };
}

async function generateTongtuLabelFile(params: {
  baseUrl: string;
  token: string;
  waybillId: string;
  websocketToken: string;
  visitorId: string;
}) {
  try {
    return await requestTongtuOrderFile({
      ...params,
      fileType: TONGTU_SYSTEM_LABEL_TYPE,
      singlePrintType: 0,
    });
  } catch (error) {
    logTongtuResponse(LOG_SCOPE, "system label fallback", {
      error: error instanceof Error ? error.message : "通途10x10标签生成失败",
    });

    return requestTongtuOrderFile({
      ...params,
      fileType: TONGTU_SINGLE_LABEL_TYPE,
      singlePrintType: 0,
    });
  }
}

function getLabelStoragePath(params: {
  shipmentId: string;
  trackingNo: string;
  contentType: string;
}) {
  const extension = params.contentType.toLowerCase().includes("png")
    ? "png"
    : params.contentType.toLowerCase().includes("jpeg") ||
        params.contentType.toLowerCase().includes("jpg")
      ? "jpg"
      : "pdf";

  return `shipment-logistics-box-marks/${params.shipmentId}/${params.trackingNo}-${randomUUID()}.${extension}`;
}

async function uploadTongtuLabelToStorage(params: {
  adminClient: ReturnType<typeof createSupabaseAdminClient>;
  shipmentId: string;
  trackingNo: string;
  fileUrl: string;
}) {
  const response = await fetch(params.fileUrl, { cache: "no-store" });
  const contentType = response.headers.get("content-type") || "application/pdf";

  logTongtuResponse(LOG_SCOPE, "download label response", {
    fileUrl: params.fileUrl,
    status: response.status,
    statusText: response.statusText,
    headers: getResponseHeaders(response),
  });

  if (!response.ok) {
    throw new Error("通途运单标签文件下载失败");
  }

  const buffer = await response.arrayBuffer();
  const storagePath = getLabelStoragePath({
    shipmentId: params.shipmentId,
    trackingNo: params.trackingNo,
    contentType,
  });
  const { error: uploadError } = await params.adminClient.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(storagePath, buffer, {
      cacheControl: "0",
      contentType,
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

export async function POST(request: Request) {
  try {
    await verifyLogisticsOperator();

    const body = (await request.json()) as TongtuLogisticsBoxMarkRequestBody;
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
    if (shipment.logistics_provider?.trim() !== "通途") {
      throw new Error("当前货件物流商不是通途");
    }

    const shipmentNo = getRequiredText(
      shipment.shipment_no,
      "当前货件缺少货件号",
    );
    const existingTrackingNo = getOptionalText(shipment.tracking_no);
    const { data: logisticsData, error: logisticsError } = await adminClient
      .from("logistics_providers")
      .select("system_url, username, password")
      .eq("provider_name", "通途")
      .single();

    if (logisticsError) {
      throw logisticsError;
    }

    const logisticsProvider = logisticsData as LogisticsProviderRow;
    const baseUrl = normalizeBaseUrl(logisticsProvider.system_url);
    const username = getRequiredText(
      logisticsProvider.username,
      "通途物流商用户名未配置",
    );
    const password = getRequiredText(
      logisticsProvider.password,
      "通途物流商密码未配置",
    );
    const websocketToken = createTongtuId();
    const visitorId = createTongtuId();
    const token = await loginTongtu({
      baseUrl,
      username,
      password,
      logScope: LOG_SCOPE,
    });
    const queryResult = await queryTongtuWaybill({
      baseUrl,
      token,
      shipmentNo,
      trackingNo: existingTrackingNo,
      websocketToken,
      visitorId,
      logScope: LOG_SCOPE,
    });
    const trackingNo =
      queryResult.trackingNo || existingTrackingNo || queryResult.waybillId;
    const waybillId = getRequiredText(
      queryResult.waybillId,
      "通途运单列表未返回可打印的运单ID",
    );

    if (!queryResult.trackingNo && !existingTrackingNo) {
      logTongtuResponse(LOG_SCOPE, "waybill tracking no fallback", {
        waybillId,
        row: queryResult.row,
      });
    }

    const labelResult = await generateTongtuLabelFile({
      baseUrl,
      token,
      waybillId,
      websocketToken,
      visitorId,
    });
    const storedFileUrl = await uploadTongtuLabelToStorage({
      adminClient,
      shipmentId: shipment.id,
      trackingNo,
      fileUrl: labelResult.fileUrl,
    });
    const { data: updatedShipment, error: updateError } = await adminClient
      .from("shipment_records")
      .update({
        tracking_no: trackingNo,
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
      trackingNo,
      waybillId,
      sourceFileUrl: labelResult.fileUrl,
      fileurl: storedFileUrl,
      queried: queryResult,
      generated: labelResult.payload,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "通途物流箱唛生成失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
