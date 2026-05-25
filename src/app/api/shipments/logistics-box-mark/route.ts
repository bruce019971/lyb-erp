import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  RISHENGHUI_PRINT_MAITOU_URL,
  verifyLogisticsOperator,
} from "../../logistics/rishenghui/_lib";

type LogisticsBoxMarkRequestBody = {
  shipmentId?: string;
  accessToken?: string;
};

type PrintMaitouResponse = {
  fileurl?: string;
  fileUrl?: string;
  data?:
    | {
        fileurl?: string;
        fileUrl?: string;
      }
    | string
    | null;
  message?: string;
  msg?: string;
};

type ShipmentRow = {
  id: string;
  tracking_no: string | null;
};

function getRequiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

function getFileUrl(result: PrintMaitouResponse | null) {
  if (!result) return "";
  if (typeof result.fileurl === "string") return result.fileurl.trim();
  if (typeof result.fileUrl === "string") return result.fileUrl.trim();
  if (typeof result.data === "string") return result.data.trim();
  if (typeof result.data?.fileurl === "string") {
    return result.data.fileurl.trim();
  }
  if (typeof result.data?.fileUrl === "string") {
    return result.data.fileUrl.trim();
  }
  return "";
}

export async function POST(request: Request) {
  try {
    await verifyLogisticsOperator();

    const body = (await request.json()) as LogisticsBoxMarkRequestBody;
    const shipmentId = getRequiredText(body.shipmentId, "缺少货件ID");
    const accessToken = getRequiredText(body.accessToken, "请先获取日升辉Token");
    const adminClient = createSupabaseAdminClient();
    const { data: shipmentData, error: shipmentError } = await adminClient
      .from("shipment_records")
      .select("id, tracking_no")
      .eq("status", "有效")
      .eq("id", shipmentId)
      .single();

    if (shipmentError) {
      throw shipmentError;
    }

    const shipment = shipmentData as ShipmentRow;
    const trackingNo = shipment.tracking_no?.trim();

    if (!trackingNo) {
      throw new Error("当前货件缺少运单编号");
    }

    const printResponse = await fetch(RISHENGHUI_PRINT_MAITOU_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(["maitou", trackingNo]),
    });
    const printResult = (await printResponse.json().catch(() => null)) as
      | PrintMaitouResponse
      | null;

    if (!printResponse.ok) {
      throw new Error(
        printResult?.message || printResult?.msg || "物流箱唛生成失败",
      );
    }

    const fileUrl = getFileUrl(printResult);
    if (!fileUrl) {
      throw new Error("物流箱唛生成接口未返回fileurl");
    }

    const { data: updatedData, error: updateError } = await adminClient
      .from("shipment_records")
      .update({
        logistics_box_mark_url: fileUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shipmentId)
      .select("*")
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      data: updatedData,
      fileurl: fileUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "物流箱唛生成失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
