import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { uploadShipmentCartonLabel } from "./_carton-label";

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

type StoreRow = {
  seller_id: string | null;
  seller_alias: string | null;
};

async function verifyOperator() {
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
  const roleData = Array.isArray(operator.role) ? operator.role[0] : operator.role;
  const permissions = Array.isArray(roleData?.menu_permissions)
    ? roleData.menu_permissions
    : [];

  if (operator.status !== "启用") {
    throw new Error("当前登录用户已停用");
  }

  if (!permissions.includes("shipments")) {
    throw new Error("当前账号没有货件管理权限");
  }
}

export async function POST(request: Request) {
  try {
    await verifyOperator();

    const body = (await request.json()) as Record<string, unknown>;
    const adminClient = createSupabaseAdminClient();
    const { data, error } = await adminClient
      .from("shipment_records")
      .insert(body)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    const { error: freightError } = await adminClient
      .from("freight_records")
      .insert({
        shipment_record_id: data.id,
        freight_paid_status: "否",
      });

    if (freightError) {
      await adminClient.from("shipment_records").delete().eq("id", data.id);
      throw freightError;
    }

    try {
      const shipmentNo =
        typeof data.shipment_no === "string" ? data.shipment_no.trim() : "";
      const orderStore =
        typeof data.order_store === "string" ? data.order_store.trim() : "";
      const boxCount =
        typeof data.box_count === "number" && Number.isFinite(data.box_count)
          ? String(data.box_count)
          : "";

      if (!shipmentNo) {
        throw new Error("当前货件缺少货件号");
      }

      if (!orderStore) {
        throw new Error("当前货件缺少下单店铺");
      }

      if (!boxCount) {
        throw new Error("当前货件缺少箱数");
      }

      const { data: storeData, error: storeError } = await adminClient
        .from("stores")
        .select("seller_id, seller_alias")
        .eq("seller_name", orderStore)
        .maybeSingle();

      if (storeError) {
        throw storeError;
      }

      const store = storeData as StoreRow | null;
      const storeId = store?.seller_id?.trim();
      const storeAlias = store?.seller_alias?.trim();

      if (!storeId || !storeAlias) {
        throw new Error("当前货件缺少店铺别名或店铺ID");
      }

      const cartonLabelUrl = await uploadShipmentCartonLabel(adminClient, {
        shipmentId: data.id,
        shipmentNo,
        boxCount,
        storeId,
        storeAlias,
        productName:
          typeof data.product_name === "string" ? data.product_name : null,
      });

      const { data: updatedData, error: updateError } = await adminClient
        .from("shipment_records")
        .update({ carton_label_url: cartonLabelUrl, updated_at: null })
        .eq("id", data.id)
        .select("*")
        .single();

      if (updateError) {
        throw updateError;
      }

      return NextResponse.json({ data: updatedData });
    } catch (labelError) {
      await adminClient.from("shipment_records").delete().eq("id", data.id);
      throw labelError;
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "货件新增失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
