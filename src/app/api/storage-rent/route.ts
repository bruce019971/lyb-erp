import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { canAccessStorageRent } from "@/lib/storage-rent-permissions";
import {
  calculateStorageRent,
  buildStorageRentFilterOptions,
  normalizeProductSearchValues,
  splitShipmentSearchValues,
  summarizeStorageRent,
  type StorageRentRecord,
  type StorageRentShipment,
} from "@/app/storage-rent/_lib/storage-rent";

type Role = { role_name: string | null; menu_permissions: string[] | null };
type Operator = { status: string | null; role: Role | Role[] | null };

const SHIPMENT_FIELDS = "id, shipment_no, product_name, box_count, overseas_warehouse_arrived_at, appointment_time, delivery_status, status, storage_rent_paid_status";

async function verifyStorageRentOperator() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(APP_SESSION_COOKIE)?.value);
  if (!session) {
    return { error: NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 }) };
  }

  const client = createSupabaseAdminClient();
  const { data: user, error: userError } = await client
    .from("system_users")
    .select("status, role:system_roles(role_name, menu_permissions)")
    .eq("id", session.userId)
    .single();
  if (userError || !user) {
    return { error: NextResponse.json({ error: "当前登录用户未绑定系统账号" }, { status: 403 }) };
  }
  const operator = user as Operator;
  const role = Array.isArray(operator.role) ? operator.role[0] : operator.role;
  if (operator.status !== "启用" || !canAccessStorageRent({
    roleName: role?.role_name,
    menuPermissions: role?.menu_permissions,
  })) {
    return { error: NextResponse.json({ error: "当前账号没有仓租管理权限" }, { status: 403 }) };
  }
  return { client };
}

export async function GET(request: Request) {
  try {
    const access = await verifyStorageRentOperator();
    if (access.error) return access.error;
    const client = access.client;
    const params = new URL(request.url).searchParams;
    const batchSize = 500;
    if (params.get("options") === "1") {
      const shipments: Pick<StorageRentShipment, "shipment_no" | "product_name">[] = [];
      for (let offset = 0; ; offset += batchSize) {
        const { data, error } = await client.from("shipment_records")
          .select("shipment_no, product_name")
          .eq("status", "有效")
          .order("id", { ascending: true })
          .range(offset, offset + batchSize - 1);
        if (error) throw new Error(error.message);
        const rows = data ?? [];
        shipments.push(...rows);
        if (rows.length < batchSize) break;
      }
      return NextResponse.json(buildStorageRentFilterOptions(shipments));
    }
    const shipmentNos = splitShipmentSearchValues(params.getAll("shipment_no"));
    const productNames = normalizeProductSearchValues(params.getAll("product_name"));
    const records: StorageRentRecord[] = [];

    // 完整读取符合条件的货件后计算，防止数据库单次返回上限截断合计。
    for (let offset = 0; ; offset += batchSize) {
      let query = client.from("shipment_records")
        .select(SHIPMENT_FIELDS)
        .eq("status", "有效")
        .not("appointment_time", "is", null)
        .order("appointment_time", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + batchSize - 1);
      if (shipmentNos.length) query = query.in("shipment_no", shipmentNos);
      if (productNames.length) query = query.in("product_name", productNames);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as StorageRentShipment[];
      for (const row of rows) {
        const record = calculateStorageRent(row);
        if (record) records.push(record);
      }
      if (rows.length < batchSize) break;
    }

    return NextResponse.json(summarizeStorageRent(records));
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "仓租记录加载失败",
    }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await verifyStorageRentOperator();
    if (access.error) return access.error;
    const body: unknown = await request.json().catch(() => null);
    const input = body && typeof body === "object" && "ids" in body ? body.ids : null;
    if (!Array.isArray(input) || input.length === 0 || input.length > 500 ||
      input.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
      return NextResponse.json({ error: "请选择1至500条有效的仓租记录" }, { status: 400 });
    }
    const ids = [...new Set(input as string[])];
    const client = access.client;
    const { data, error } = await client.from("shipment_records")
      .select(SHIPMENT_FIELDS).in("id", ids);
    if (error) throw new Error(error.message);
    const records = (data ?? []) as StorageRentShipment[];
    if (records.length !== ids.length) {
      return NextResponse.json({ error: "部分货件不存在，请刷新列表后重试" }, { status: 409 });
    }
    if (records.some((record) => calculateStorageRent(record)?.storage_fee == null)) {
      return NextResponse.json({ error: "部分货件未约仓、已失效或仓租无法计算，请刷新列表后重试" }, { status: 409 });
    }
    const unpaidIds = records.filter((record) => record.storage_rent_paid_status !== "是")
      .map((record) => record.id);
    if (!unpaidIds.length) return NextResponse.json({ updatedCount: 0 });

    const { data: updated, error: updateError } = await client.from("shipment_records")
      .update({ storage_rent_paid_status: "是" })
      .in("id", unpaidIds)
      .eq("status", "有效")
      .eq("storage_rent_paid_status", "否")
      .not("overseas_warehouse_arrived_at", "is", null)
      .not("appointment_time", "is", null)
      .select("id");
    if (updateError) throw new Error(updateError.message);
    return NextResponse.json({ updatedCount: updated?.length ?? 0 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "批量设置已支付失败",
    }, { status: 500 });
  }
}
