import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fetchRishenghuiFreightUnitPrice } from "../../shipments/_rishenghui";

export const runtime = "nodejs";

type OperatorRow = {
  id: string;
  status: "启用" | "停用" | null;
  role:
    | {
        menu_permissions: string[] | null;
      }
    | Array<{
        menu_permissions: string[] | null;
      }>
    | null;
};

type FreightUnitPriceRequestBody = {
  freightId?: string;
  accessToken?: string;
  overwrite?: boolean;
};

type FreightRow = {
  id: string;
  freight_unit_price: number | null;
  volume: number | null;
  extra_fee: number | null;
  shipment:
    | {
        tracking_no: string | null;
        logistics_provider: string | null;
      }
    | Array<{
        tracking_no: string | null;
        logistics_provider: string | null;
      }>
    | null;
};

async function verifyFreightOperator() {
  const cookieStore = await cookies();
  const token = cookieStore.get(APP_SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);

  if (!session) {
    throw new Error("登录状态已失效，请重新登录");
  }

  const adminClient = createSupabaseAdminClient();
  const { data, error } = await adminClient
    .from("system_users")
    .select("id, status, role:system_roles(menu_permissions)")
    .eq("id", session.userId)
    .single();

  if (error) {
    throw new Error("当前登录用户未绑定系统账号");
  }

  const operator = data as OperatorRow;
  const roleData = Array.isArray(operator.role)
    ? operator.role[0]
    : operator.role;
  const permissions = Array.isArray(roleData?.menu_permissions)
    ? roleData.menu_permissions
    : [];

  if (operator.status !== "启用") {
    throw new Error("当前登录用户已停用");
  }

  if (!permissions.includes("freights")) {
    throw new Error("当前账号没有运费管理权限");
  }
}

function getRequiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function unitPricesEqual(left: number, right: number) {
  return Math.round(left * 1_000_000) === Math.round(right * 1_000_000);
}

function calculateTotalFee(values: {
  freightUnitPrice: number;
  volume: number | null;
  extraFee: number | null;
}) {
  if (!isFiniteNumber(values.volume)) {
    return null;
  }

  const extraFee = isFiniteNumber(values.extraFee) ? values.extraFee : 0;
  return Number((values.freightUnitPrice * values.volume + extraFee).toFixed(2));
}

export async function POST(request: Request) {
  try {
    await verifyFreightOperator();

    const body = (await request.json()) as FreightUnitPriceRequestBody;
    const freightId = getRequiredText(body.freightId, "缺少运费记录ID");
    const accessToken = getRequiredText(body.accessToken, "请先获取日升辉Token");
    const overwrite = body.overwrite === true;
    const adminClient = createSupabaseAdminClient();
    const { data, error } = await adminClient
      .from("freight_records")
      .select(
        "id, freight_unit_price, volume, extra_fee, shipment:shipment_records!inner(tracking_no, logistics_provider)",
      )
      .eq("id", freightId)
      .eq("shipment.status", "有效")
      .single();

    if (error) {
      throw error;
    }

    const freight = data as FreightRow;
    const shipment = Array.isArray(freight.shipment)
      ? freight.shipment[0]
      : freight.shipment;
    const providerName = shipment?.logistics_provider?.trim() || "";
    const trackingNo = shipment?.tracking_no?.trim() || "";

    if (providerName !== "日升辉") {
      throw new Error("当前货件不是日升辉物流商，不能获取日升辉单价");
    }

    if (!trackingNo) {
      throw new Error("当前货件缺少运单编号");
    }

    const unitPriceResult = await fetchRishenghuiFreightUnitPrice({
      accessToken,
      trackingNo,
    });

    if (!isFiniteNumber(unitPriceResult.unitPrice)) {
      throw new Error("日升辉账单明细中未查询到运费单价");
    }

    const unitPrice = unitPriceResult.unitPrice;
    const currentUnitPrice = freight.freight_unit_price;

    if (
      isFiniteNumber(currentUnitPrice) &&
      !unitPricesEqual(currentUnitPrice, unitPrice) &&
      !overwrite
    ) {
      return NextResponse.json({
        unitPrice,
        currentUnitPrice,
        totalFee: null,
        billCode: unitPriceResult.billCode,
        matchedCount: unitPriceResult.matchedRows.length,
        detailCount: unitPriceResult.detailRows.length,
        requiresOverwrite: true,
        updated: false,
        row: unitPriceResult.detailRow,
      });
    }

    const totalFee = calculateTotalFee({
      freightUnitPrice: unitPrice,
      volume: freight.volume,
      extraFee: freight.extra_fee,
    });
    const updateValues: {
      freight_unit_price: number;
      total_fee?: number | null;
      updated_at: string;
    } = {
      freight_unit_price: unitPrice,
      updated_at: new Date().toISOString(),
    };

    if (totalFee !== null) {
      updateValues.total_fee = totalFee;
    }

    const { error: updateError } = await adminClient
      .from("freight_records")
      .update(updateValues)
      .eq("id", freight.id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      unitPrice,
      currentUnitPrice,
      totalFee,
      billCode: unitPriceResult.billCode,
      matchedCount: unitPriceResult.matchedRows.length,
      detailCount: unitPriceResult.detailRows.length,
      requiresOverwrite: false,
      updated: true,
      row: unitPriceResult.detailRow,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "日升辉运费单价获取失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
