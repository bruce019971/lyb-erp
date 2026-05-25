import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { uploadShipmentCartonLabel } from "../_carton-label";

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

type ShipmentRow = {
  id: string;
  shipment_no: string | null;
  order_store: string | null;
  product_name: string | null;
  box_count: number | null;
  delivery_status: string | null;
  warehouse_arrived_status: string | null;
  overseas_warehouse_arrived_at: string | null;
};

type StoreRow = {
  seller_name: string | null;
  seller_id: string | null;
  seller_alias: string | null;
  seller_type: string | null;
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

function normalizeShipmentNos(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function isShipmentLocked(record: ShipmentRow) {
  return (
    record.delivery_status === "是" ||
    record.warehouse_arrived_status === "是" ||
    Boolean(record.overseas_warehouse_arrived_at)
  );
}

export async function POST(request: Request) {
  try {
    await verifyOperator();

    const body = (await request.json()) as { shipmentNos?: string[] };
    const shipmentNos = normalizeShipmentNos(body.shipmentNos);

    if (!shipmentNos.length) {
      throw new Error("请输入需要处理的货件号");
    }

    const adminClient = createSupabaseAdminClient();
    const { data: shipmentsData, error: shipmentsError } = await adminClient
      .from("shipment_records")
      .select(
        "id, shipment_no, order_store, product_name, box_count, delivery_status, warehouse_arrived_status, overseas_warehouse_arrived_at",
      )
      .eq("status", "有效")
      .in("shipment_no", shipmentNos);

    if (shipmentsError) {
      throw shipmentsError;
    }

    const shipments = (shipmentsData ?? []) as ShipmentRow[];
    const shipmentMap = new Map(
      shipments
        .map((item) => [item.shipment_no?.trim(), item] as const)
        .filter((item): item is readonly [string, ShipmentRow] =>
          Boolean(item[0]),
        ),
    );
    const storeNames = Array.from(
      new Set(
        shipments
          .map((item) => item.order_store?.trim())
          .filter((item): item is string => Boolean(item)),
      ),
    );
    const { data: storesData, error: storesError } = storeNames.length
      ? await adminClient
          .from("stores")
          .select("seller_name, seller_id, seller_alias, seller_type")
          .in("seller_name", storeNames)
      : { data: [], error: null };

    if (storesError) {
      throw storesError;
    }

    const storeMap = new Map(
      ((storesData ?? []) as StoreRow[])
        .map((item) => [item.seller_name?.trim(), item] as const)
        .filter((item): item is readonly [string, StoreRow] =>
          Boolean(item[0]),
        ),
    );
    const results: Array<{
      shipmentNo: string;
      success: boolean;
      url?: string;
      error?: string;
    }> = [];

    for (const shipmentNo of shipmentNos) {
      try {
        const shipment = shipmentMap.get(shipmentNo);

        if (!shipment) {
          throw new Error("未找到货件");
        }

        if (isShipmentLocked(shipment)) {
          throw new Error("已到仓的货件不允许修改");
        }

        const boxCount =
          typeof shipment.box_count === "number" &&
          Number.isFinite(shipment.box_count)
            ? String(shipment.box_count)
            : "";

        if (!boxCount) {
          throw new Error("缺少箱数");
        }

        const storeName = shipment.order_store?.trim();
        const store = storeName ? storeMap.get(storeName) : undefined;
        const storeId = store?.seller_id?.trim();
        const storeAlias = store?.seller_alias?.trim();
        const storeType = store?.seller_type?.trim();

        if (!storeId || !storeAlias) {
          throw new Error("缺少店铺别名或店铺ID");
        }

        const cartonLabelUrl = await uploadShipmentCartonLabel(adminClient, {
          shipmentId: shipment.id,
          shipmentNo,
          boxCount,
          storeId,
          storeAlias,
          storeType,
          productName: shipment.product_name,
        });

        const { error: updateError } = await adminClient
          .from("shipment_records")
          .update({
            carton_label_url: cartonLabelUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", shipment.id);

        if (updateError) {
          throw updateError;
        }

        results.push({
          shipmentNo,
          success: true,
          url: cartonLabelUrl,
        });
      } catch (error) {
        results.push({
          shipmentNo,
          success: false,
          error: error instanceof Error ? error.message : "处理失败",
        });
      }
    }

    return NextResponse.json({
      data: {
        total: results.length,
        successCount: results.filter((item) => item.success).length,
        failureCount: results.filter((item) => !item.success).length,
        results,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "外箱标签批量处理失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
