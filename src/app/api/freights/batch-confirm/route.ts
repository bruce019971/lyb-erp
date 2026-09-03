import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type OperatorRow = {
  id: string;
  status: "启用" | "停用" | null;
  role:
    | { menu_permissions: string[] | null }
    | Array<{ menu_permissions: string[] | null }>
    | null;
};

type FreightPaymentRow = {
  id: string;
  bill_amount: number | string | null;
  freight_paid_status: string | null;
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

  return adminClient;
}

function normalizeFreightIds(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("缺少需要确认的运费记录");
  }

  const ids = Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );

  if (ids.length === 0) {
    throw new Error("请先选择需要确认的运费记录");
  }

  return ids;
}

function hasBillAmount(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;

  const normalizedValue = value.trim();
  return normalizedValue !== "" && Number.isFinite(Number(normalizedValue));
}

export async function POST(request: Request) {
  try {
    const adminClient = await verifyFreightOperator();
    const body = (await request.json()) as Record<string, unknown>;
    const ids = normalizeFreightIds(body.ids);
    const { data, error } = await adminClient
      .from("freight_records")
      .select("id, bill_amount, freight_paid_status")
      .in("id", ids);

    if (error) {
      throw error;
    }

    const records = (data ?? []) as FreightPaymentRow[];
    if (records.length !== ids.length) {
      throw new Error("部分运费记录不存在，请刷新列表后重试");
    }

    const unbilledCount = records.filter(
      (record) => !hasBillAmount(record.bill_amount),
    ).length;
    if (unbilledCount > 0) {
      throw new Error(`所选记录中有 ${unbilledCount} 条尚未出账单，不能确认`);
    }

    const confirmableIds = records
      .filter((record) => record.freight_paid_status !== "是")
      .map((record) => record.id);

    if (confirmableIds.length === 0) {
      return NextResponse.json({ updatedCount: 0 });
    }

    const { data: updatedRecords, error: updateError } = await adminClient
      .from("freight_records")
      .update({ freight_paid_status: "是" })
      .in("id", confirmableIds)
      .not("bill_amount", "is", null)
      .select("id");

    if (updateError) {
      throw updateError;
    }

    if ((updatedRecords ?? []).length !== confirmableIds.length) {
      throw new Error("部分记录的账单状态已变化，请刷新列表后重试");
    }

    return NextResponse.json({ updatedCount: updatedRecords?.length ?? 0 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "批量确认运费失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
