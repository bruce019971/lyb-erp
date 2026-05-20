import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  RISHENGHUI_COMMON_IMPORT_URL,
  RISHENGHUI_FILE_UPLOAD_URL,
  RISHENGHUI_TPL_LIST_VALUES_URL,
  verifyLogisticsOperator,
} from "../../logistics/rishenghui/_lib";

export const runtime = "nodejs";

type RishenghuiOrderSubmitRequestBody = {
  shipmentId?: string;
  fileUrl?: string;
  fileName?: string;
  accessToken?: string;
};

type UploadFileItem = {
  filesize?: unknown;
  filesuffix?: unknown;
  originalname?: unknown;
  path?: unknown;
  url?: unknown;
};

type UploadResult = UploadFileItem[];

type TplListValuesResult =
  | Array<{ packno?: unknown }>
  | {
      data?: Array<{ packno?: unknown }> | { records?: Array<{ packno?: unknown }> };
      result?: Array<{ packno?: unknown }>;
      list?: Array<{ packno?: unknown }>;
      rows?: Array<{ packno?: unknown }>;
      records?: Array<{ packno?: unknown }>;
      message?: unknown;
      msg?: unknown;
      error?: unknown;
  }
  | null;

type RishenghuiListHeaders = {
  Authorization: string;
  "content-type": string;
};

function getRequiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

function getPayloadError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const result = payload as { message?: unknown; msg?: unknown; error?: unknown };
  if (typeof result.message === "string") return result.message;
  if (typeof result.msg === "string") return result.msg;
  if (typeof result.error === "string") return result.error;
  return "";
}

function getUploadFileInfo(result: UploadResult | null) {
  const firstFile = Array.isArray(result) ? result[0] : null;
  const path = typeof firstFile?.path === "string" ? firstFile.path.trim() : "";
  const url = typeof firstFile?.url === "string" ? firstFile.url.trim() : "";

  return { path, url };
}

function getPayloadSummary(payload: unknown) {
  const text = JSON.stringify(payload);
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

function getTodayDateText() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

function getPackNo(value: unknown): string {
  if (!value) return "";

  if (Array.isArray(value)) {
    for (const item of value) {
      const packNo = getPackNo(item);
      if (packNo) return packNo;
    }
    return "";
  }

  if (typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  if (typeof record.packno === "string" && record.packno.trim()) {
    return record.packno.trim();
  }

  for (const item of Object.values(record)) {
    const packNo = getPackNo(item);
    if (packNo) return packNo;
  }

  return "";
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestRishenghuiPackNo(headers: RishenghuiListHeaders) {
  const today = getTodayDateText();
  const response = await fetch(RISHENGHUI_TPL_LIST_VALUES_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      pagesize: 1,
      pageno: 1,
      reportno: "ORDERMX",
      opentype: "find",
      colen: "find",
      userquery1: today,
      userquery2: today,
      userquery4: "allqty",
      userquery3: "%",
      userquery6: "%",
    }),
  });
  const result = (await response.json().catch(() => null)) as
    | TplListValuesResult
    | null;
  console.log("[rishenghui-order-submit] values response", {
    status: response.status,
    result,
  });

  if (!response.ok) {
    throw new Error(getPayloadError(result) || "日升辉运单编号查询失败");
  }

  return {
    packNo: getPackNo(result),
    result,
  };
}

async function waitForRishenghuiPackNo(headers: RishenghuiListHeaders) {
  let latestResult: TplListValuesResult | null = null;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const { packNo, result } = await requestRishenghuiPackNo(headers);
    latestResult = result;

    if (packNo) {
      return { packNo, result };
    }

    if (attempt < 5) {
      await wait(1000);
    }
  }

  return {
    packNo: "",
    result: latestResult,
  };
}

export async function POST(request: Request) {
  try {
    await verifyLogisticsOperator();

    const body = (await request.json()) as RishenghuiOrderSubmitRequestBody;
    const shipmentId = getRequiredText(body.shipmentId, "缺少货件ID");
    const fileUrl = getRequiredText(body.fileUrl, "缺少发票文件URL");
    const fileName = getRequiredText(body.fileName, "缺少发票文件名");
    const accessToken = getRequiredText(body.accessToken, "缺少日升辉accessToken");
    const authorization = `Bearer ${accessToken}`;

    const fileResponse = await fetch(fileUrl, { cache: "no-store" });
    if (!fileResponse.ok) {
      throw new Error("发票文件读取失败");
    }

    const fileBuffer = await fileResponse.arrayBuffer();
    const file = new File([fileBuffer], fileName, {
      type:
        fileResponse.headers.get("content-type") ||
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const formData = new FormData();
    formData.append("file", file);

    const uploadResponse = await fetch(RISHENGHUI_FILE_UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: authorization,
      },
      body: formData,
    });
    const uploadResult = (await uploadResponse.json().catch(() => null)) as
      | UploadResult
      | null;
    console.log("[rishenghui-order-submit] upload response", {
      status: uploadResponse.status,
      result: uploadResult,
    });

    if (!uploadResponse.ok) {
      throw new Error(getPayloadError(uploadResult) || "日升辉发票上传失败");
    }

    const uploadFileInfo = getUploadFileInfo(uploadResult);
    if (!uploadFileInfo.path || !uploadFileInfo.url) {
      throw new Error(
        `日升辉发票上传接口未返回有效数组path或url：${getPayloadSummary(uploadResult)}`,
      );
    }

    const importResponse = await fetch(RISHENGHUI_COMMON_IMPORT_URL, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        itemno: "21",
        impgc: "pro_api_run",
        path: uploadFileInfo.path,
        url: uploadFileInfo.url,
        reportno: "ORDERMX",
      }),
    });
    const importResult = await importResponse.json().catch(() => null);
    console.log("[rishenghui-order-submit] import response", {
      status: importResponse.status,
      result: importResult,
    });

    if (!importResponse.ok) {
      throw new Error(getPayloadError(importResult) || "日升辉发票导入失败");
    }

    const { packNo, result: listResult } = await waitForRishenghuiPackNo({
      Authorization: authorization,
      "content-type": "application/json",
    });
    if (!packNo) {
      throw new Error(
        `日升辉运单编号查询结果为空：${getPayloadSummary(listResult)}`,
      );
    }

    const adminClient = createSupabaseAdminClient();
    const { data: updatedShipment, error: updateError } = await adminClient
      .from("shipment_records")
      .update({
        tracking_no: packNo,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shipmentId)
      .select("*")
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      data: updatedShipment,
      packno: packNo,
      upload: uploadResult,
      imported: importResult,
      list: listResult,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "日升辉发票上传失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
