import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fetchRishenghuiBillAmount } from "../../shipments/_rishenghui";

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

type FreightBillRequestBody = {
  freightId?: string;
  accessToken?: string;
};

type FreightRow = {
  id: string;
  total_fee: number | null;
  freight_paid_status: string | null;
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

function amountsEqual(left: number, right: number) {
  return Math.round(left * 100) === Math.round(right * 100);
}

export async function POST(request: Request) {
  try {
    await verifyFreightOperator();

    const body = (await request.json()) as FreightBillRequestBody;
    const freightId = getRequiredText(body.freightId, "缺少运费记录ID");
    const accessToken = getRequiredText(body.accessToken, "请先获取日升辉Token");
    const adminClient = createSupabaseAdminClient();
    const { data, error } = await adminClient
      .from("freight_records")
      .select(
        "id, total_fee, freight_paid_status, shipment:shipment_records!inner(tracking_no, logistics_provider)",
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
      throw new Error("当前货件不是日升辉物流商，不能获取日升辉账单");
    }

    if (!trackingNo) {
      throw new Error("当前货件缺少运单编号");
    }

    if (!isFiniteNumber(freight.total_fee)) {
      throw new Error("当前货件总费用为空，不能获取账单");
    }

    if (freight.freight_paid_status === "是") {
      throw new Error("已支付的货件不能再次获取账单");
    }

    const billResult = await fetchRishenghuiBillAmount({
      accessToken,
      trackingNo,
    });

    if (!isFiniteNumber(billResult.billAmount)) {
      throw new Error("日升辉账单中未查询到账单金额");
    }

    const billAmount = billResult.billAmount;
    const isConsistent = amountsEqual(billAmount, freight.total_fee);
    const { error: updateError } = await adminClient
      .from("freight_records")
      .update({
        bill_amount: billAmount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", freight.id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      billAmount,
      totalFee: freight.total_fee,
      isConsistent,
      matchedCount: billResult.matchedRows.length,
      row: billResult.row,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "日升辉账单获取失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
