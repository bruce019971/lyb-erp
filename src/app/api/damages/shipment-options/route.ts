import { NextResponse } from "next/server";

import type { DamageShipmentOption } from "@/app/damages/_lib/damages";
import { calculateFreightUnitFee } from "@/app/freights/_lib/freights";
import { verifyDamageOperator } from "../_lib/operator";

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

export async function GET() {
  try {
    const adminClient = await verifyDamageOperator();
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
