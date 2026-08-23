import { NextResponse } from "next/server";

import type { DamageCreateValues } from "@/app/damages/_lib/damages";

import { verifyDamageOperator } from "./_lib/operator";

class DuplicateDamageShipmentError extends Error {}

function getRequiredText(
  payload: Record<string, unknown>,
  field: keyof DamageCreateValues,
  label: string,
) {
  const value = payload[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label}不能为空`);
  }
  return value.trim();
}

function getRequiredNumber(
  payload: Record<string, unknown>,
  field: keyof DamageCreateValues,
  label: string,
) {
  const value = payload[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label}格式不正确`);
  }
  return value;
}

function parseCreatePayload(payload: unknown): DamageCreateValues {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("货损记录内容格式不正确");
  }

  const values = payload as Record<string, unknown>;
  const productCount = getRequiredNumber(values, "product_count", "产品数量");
  const damageCount = getRequiredNumber(values, "damage_count", "货损数量");
  const freightUnitPrice = getRequiredNumber(
    values,
    "freight_unit_price",
    "单个运费",
  );
  const productUnitPrice = getRequiredNumber(
    values,
    "product_unit_price",
    "产品单价",
  );
  const deliveryDate = getRequiredText(values, "delivery_date", "送仓日期");

  if (!Number.isInteger(productCount) || productCount <= 0) {
    throw new Error("产品数量必须为大于0的整数");
  }
  if (
    !Number.isInteger(damageCount) ||
    damageCount <= 0 ||
    damageCount > productCount
  ) {
    throw new Error("货损数量必须为不大于产品数量的正整数");
  }
  if (freightUnitPrice < 0 || productUnitPrice < 0) {
    throw new Error("单个运费和产品单价不能小于0");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
    throw new Error("送仓日期格式不正确");
  }

  return {
    shipment_record_id: getRequiredText(
      values,
      "shipment_record_id",
      "关联货件",
    ),
    delivery_shipment_no: getRequiredText(
      values,
      "delivery_shipment_no",
      "送仓货件号",
    ),
    product_name: getRequiredText(values, "product_name", "产品名称"),
    delivery_store: getRequiredText(values, "delivery_store", "送仓店铺"),
    delivery_date: deliveryDate,
    product_count: productCount,
    damage_count: damageCount,
    freight_unit_price: freightUnitPrice,
    product_unit_price: productUnitPrice,
  };
}

export async function POST(request: Request) {
  try {
    const adminClient = await verifyDamageOperator();
    const values = parseCreatePayload(await request.json());
    const { data: existingRecord, error: existingError } = await adminClient
      .from("damage_records")
      .select("id")
      .eq("delivery_shipment_no", values.delivery_shipment_no)
      .limit(1)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);
    if (existingRecord) {
      throw new DuplicateDamageShipmentError(
        "该送仓货件号已存在货损记录，不允许重复新增",
      );
    }

    const { data, error } = await adminClient
      .from("damage_records")
      .insert(values)
      .select("*")
      .single();

    if (error?.code === "23505") {
      throw new DuplicateDamageShipmentError(
        "该送仓货件号已存在货损记录，不允许重复新增",
      );
    }
    if (error) throw new Error(error.message);

    return NextResponse.json({ data });
  } catch (error) {
    const isDuplicate = error instanceof DuplicateDamageShipmentError;
    const message =
      error instanceof Error ? error.message : "货损记录新增失败，请稍后重试";
    return NextResponse.json(
      { error: message },
      { status: isDuplicate ? 409 : 400 },
    );
  }
}
