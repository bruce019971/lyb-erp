import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import type { DamageShipmentOption } from "@/app/damages/_lib/damages";
import { calculateFreightUnitFee } from "@/app/freights/_lib/freights";
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

type ShipmentOptionRow = {
  id: string;
  shipment_no: string | null;
  product_name: string | null;
  order_store: string | null;
  appointment_time: string | null;
  total_qty: number | null;
  status: string | null;
};

type RelabelOptionRow = {
  original_shipment_no: string | null;
  delivery_shipment_no: string | null;
  delivery_store: string | null;
};

type ProductPriceRow = {
  product_name: string | null;
  store_name: string | null;
  product_unit_price: number | null;
};

type FreightRow = {
  shipment_record_id: string;
  total_fee: number | null;
};

function getProductKey(productName?: string | null, storeName?: string | null) {
  return `${productName?.trim() ?? ""}\u0000${storeName?.trim() ?? ""}`;
}

function getShipmentNo(value?: string | null) {
  return value?.trim() ?? "";
}

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

  if (!permissions.includes("damages")) {
    throw new Error("当前账号没有货损管理权限");
  }

  return adminClient;
}

export async function GET() {
  try {
    const adminClient = await verifyOperator();
    const [shipmentResult, relabelResult, productResult, freightResult] =
      await Promise.all([
        adminClient
          .from("shipment_records")
          .select(
            "id, shipment_no, product_name, order_store, appointment_time, total_qty, status",
          )
          .not("shipment_no", "is", null)
          .order("created_at", { ascending: false, nullsFirst: false }),
        adminClient
          .from("relabel_records")
          .select("original_shipment_no, delivery_shipment_no, delivery_store")
          .not("delivery_shipment_no", "is", null)
          .order("created_at", { ascending: false, nullsFirst: false }),
        adminClient
          .from("products")
          .select("product_name, store_name, product_unit_price")
          .eq("status", "有效"),
        adminClient
          .from("freight_records")
          .select("shipment_record_id, total_fee"),
      ]);

    if (shipmentResult.error) throw shipmentResult.error;
    if (relabelResult.error) throw relabelResult.error;
    if (productResult.error) throw productResult.error;
    if (freightResult.error) throw freightResult.error;

    const productPriceMap = new Map<string, number | null>();
    ((productResult.data ?? []) as ProductPriceRow[]).forEach((item) => {
      const key = getProductKey(item.product_name, item.store_name);
      if (item.product_name?.trim() && !productPriceMap.has(key)) {
        productPriceMap.set(key, item.product_unit_price);
      }
    });

    const freightTotalMap = new Map<string, number | null>(
      ((freightResult.data ?? []) as FreightRow[]).map((item) => [
        item.shipment_record_id,
        item.total_fee,
      ]),
    );

    const shipmentRows = (shipmentResult.data ?? []) as ShipmentOptionRow[];
    const shipmentByNo = new Map<string, ShipmentOptionRow>();
    shipmentRows.forEach((item) => {
      const shipmentNo = getShipmentNo(item.shipment_no);
      const current = shipmentByNo.get(shipmentNo);
      if (
        shipmentNo &&
        (!current || (current.status !== "有效" && item.status === "有效"))
      ) {
        shipmentByNo.set(shipmentNo, item);
      }
    });

    function createOption(
      originalShipment: ShipmentOptionRow,
      deliveryShipmentNo: string,
      deliveryStore = originalShipment.order_store,
    ): DamageShipmentOption {
      return {
        shipment_record_id: originalShipment.id,
        delivery_shipment_no: deliveryShipmentNo,
        product_name: originalShipment.product_name,
        delivery_store: deliveryStore,
        delivery_date: originalShipment.appointment_time,
        product_count: originalShipment.total_qty,
        freight_unit_price: calculateFreightUnitFee(
          freightTotalMap.get(originalShipment.id),
          originalShipment.total_qty,
        ),
        product_unit_price:
          productPriceMap.get(
            getProductKey(
              originalShipment.product_name,
              originalShipment.order_store,
            ),
          ) ??
          null,
      };
    }

    const optionByDeliveryShipmentNo = new Map<string, DamageShipmentOption>();
    shipmentRows.forEach((item) => {
      const shipmentNo = getShipmentNo(item.shipment_no);
      if (
        item.status === "有效" &&
        shipmentNo &&
        !optionByDeliveryShipmentNo.has(shipmentNo)
      ) {
        optionByDeliveryShipmentNo.set(
          shipmentNo,
          createOption(item, shipmentNo),
        );
      }
    });

    ((relabelResult.data ?? []) as RelabelOptionRow[]).forEach((item) => {
      const deliveryShipmentNo = getShipmentNo(item.delivery_shipment_no);
      const originalShipment = shipmentByNo.get(
        getShipmentNo(item.original_shipment_no),
      );

      if (
        deliveryShipmentNo &&
        originalShipment &&
        !optionByDeliveryShipmentNo.has(deliveryShipmentNo)
      ) {
        optionByDeliveryShipmentNo.set(
          deliveryShipmentNo,
          createOption(
            originalShipment,
            deliveryShipmentNo,
            item.delivery_store?.trim() || originalShipment.order_store,
          ),
        );
      }
    });

    const data = Array.from(optionByDeliveryShipmentNo.values());

    return NextResponse.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "货损货件数据获取失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
