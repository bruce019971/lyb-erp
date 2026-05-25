import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

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
  product_name: string | null;
  order_store: string | null;
  total_qty: number | null;
};

type ProductRow = {
  product_name: string | null;
  store_name: string | null;
  product_unit_price: number | null;
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

function normalizeIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function getProductKey(productName?: string | null, storeName?: string | null) {
  const normalizedProductName = productName?.trim();
  const normalizedStoreName = storeName?.trim();

  if (!normalizedProductName || !normalizedStoreName) return "";

  return `${normalizedProductName}\n${normalizedStoreName}`;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function getShipmentLabel(shipment: ShipmentRow) {
  return shipment.shipment_no?.trim() || shipment.id;
}

export async function POST(request: Request) {
  try {
    await verifyOperator();

    const body = (await request.json()) as { ids?: unknown };
    const ids = normalizeIds(body.ids);

    if (!ids.length) {
      throw new Error("请选择需要处理的货件");
    }

    const adminClient = createSupabaseAdminClient();
    const { data: shipmentsData, error: shipmentsError } = await adminClient
      .from("shipment_records")
      .select("id, shipment_no, product_name, order_store, total_qty")
      .eq("status", "有效")
      .in("id", ids);

    if (shipmentsError) {
      throw shipmentsError;
    }

    const shipments = (shipmentsData ?? []) as ShipmentRow[];
    if (!shipments.length) {
      throw new Error("未找到需要处理的货件");
    }

    const productNames = Array.from(
      new Set(
        shipments
          .map((item) => item.product_name?.trim())
          .filter((item): item is string => Boolean(item)),
      ),
    );
    const storeNames = Array.from(
      new Set(
        shipments
          .map((item) => item.order_store?.trim())
          .filter((item): item is string => Boolean(item)),
      ),
    );

    const { data: productsData, error: productsError } =
      productNames.length && storeNames.length
        ? await adminClient
            .from("products")
            .select("product_name, store_name, product_unit_price")
            .eq("status", "有效")
            .in("product_name", productNames)
            .in("store_name", storeNames)
        : { data: [], error: null };

    if (productsError) {
      throw productsError;
    }

    const productMap = new Map(
      ((productsData ?? []) as ProductRow[])
        .map((item) => [getProductKey(item.product_name, item.store_name), item] as const)
        .filter((item): item is readonly [string, ProductRow] =>
          Boolean(item[0]),
        ),
    );
    const failures: Array<{ shipmentNo: string; error: string }> = [];
    let successCount = 0;

    for (const shipment of shipments) {
      const shipmentNo = getShipmentLabel(shipment);
      const productKey = getProductKey(shipment.product_name, shipment.order_store);
      const product = productMap.get(productKey);

      if (!productKey || !product) {
        failures.push({ shipmentNo, error: "未找到对应产品" });
        continue;
      }

      if (
        typeof product.product_unit_price !== "number" ||
        !Number.isFinite(product.product_unit_price)
      ) {
        failures.push({ shipmentNo, error: "产品单价为空" });
        continue;
      }

      if (
        typeof shipment.total_qty !== "number" ||
        !Number.isFinite(shipment.total_qty)
      ) {
        failures.push({ shipmentNo, error: "产品总数为空" });
        continue;
      }

      const goodsValue = roundMoney(product.product_unit_price * shipment.total_qty);
      const { error: updateError } = await adminClient
        .from("shipment_records")
        .update({
          goods_value: goodsValue,
          updated_at: new Date().toISOString(),
        })
        .eq("id", shipment.id);

      if (updateError) {
        failures.push({ shipmentNo, error: updateError.message });
        continue;
      }

      successCount += 1;
    }

    return NextResponse.json({
      data: {
        total: shipments.length,
        successCount,
        failureCount: failures.length,
        failures,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "货物价值批量计算失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
