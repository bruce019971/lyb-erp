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

type FreightRow = {
  id: string;
  shipment_record_id: string;
  freight_unit_price: number | null;
  volume: number | null;
  extra_fee: number | null;
  freight_paid_status: string | null;
  created_at: string | null;
  updated_at: string | null;
  shipment:
    | {
        shipment_no: string | null;
        tracking_no: string | null;
        logistics_provider: string | null;
        product_name: string | null;
        box_count: number | null;
        total_qty: number | null;
      }
    | Array<{
        shipment_no: string | null;
        tracking_no: string | null;
        logistics_provider: string | null;
        product_name: string | null;
        box_count: number | null;
        total_qty: number | null;
      }>
    | null;
};

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function calculateFreightTotalFee(
  freightUnitPrice?: number | null,
  volume?: number | null,
  extraFee?: number | null,
) {
  if (
    typeof freightUnitPrice !== "number" ||
    !Number.isFinite(freightUnitPrice) ||
    typeof volume !== "number" ||
    !Number.isFinite(volume)
  ) {
    return null;
  }

  const normalizedExtraFee =
    typeof extraFee === "number" && Number.isFinite(extraFee) ? extraFee : 0;

  return roundMoney(freightUnitPrice * volume + normalizedExtraFee);
}

function calculateFreightUnitFee(
  totalFee?: number | null,
  totalQty?: number | null,
) {
  if (
    typeof totalFee !== "number" ||
    !Number.isFinite(totalFee) ||
    typeof totalQty !== "number" ||
    !Number.isFinite(totalQty) ||
    totalQty <= 0
  ) {
    return null;
  }

  return roundMoney(totalFee / totalQty);
}

function normalizeFreightRow(row: FreightRow) {
  const shipment = Array.isArray(row.shipment) ? row.shipment[0] : row.shipment;
  const totalFee = calculateFreightTotalFee(
    row.freight_unit_price,
    row.volume,
    row.extra_fee,
  );

  return {
    id: row.id,
    shipment_record_id: row.shipment_record_id,
    shipment_no: shipment?.shipment_no ?? null,
    tracking_no: shipment?.tracking_no ?? null,
    logistics_provider: shipment?.logistics_provider ?? null,
    product_name: shipment?.product_name ?? null,
    freight_unit_price: row.freight_unit_price,
    volume: row.volume,
    extra_fee: row.extra_fee,
    box_count: shipment?.box_count ?? null,
    total_qty: shipment?.total_qty ?? null,
    total_fee: totalFee,
    unit_fee: calculateFreightUnitFee(totalFee, shipment?.total_qty ?? null),
    freight_paid_status: row.freight_paid_status ?? "否",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeTextValue(value: unknown) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

function normalizeMultiSelectValues(values: string[]) {
  return values.map((item) => item.trim()).filter(Boolean);
}

function splitSearchTexts(values: string[]) {
  return values
    .flatMap((item) => item.split(/[\s,，]+/))
    .map((item) => item.trim())
    .filter(Boolean);
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

export async function GET(request: Request) {
  try {
    await verifyOperator();

    const { searchParams } = new URL(request.url);
    const current = Number(searchParams.get("current") ?? 1);
    const pageSize = Number(searchParams.get("pageSize") ?? 40);
    const from = (Math.max(current, 1) - 1) * Math.max(pageSize, 1);
    const to = from + Math.max(pageSize, 1) - 1;
    const orderField = searchParams.get("orderField") || "created_at";
    const orderDirection = searchParams.get("orderDirection") || "descend";
    const shipmentNoValues = splitSearchTexts(
      searchParams.getAll("shipment_no"),
    );
    const trackingNoValues = splitSearchTexts(
      searchParams.getAll("tracking_no"),
    );
    const productNameValues = splitSearchTexts(
      searchParams.getAll("product_name"),
    );
    const logisticsProviderValues = normalizeMultiSelectValues(
      searchParams.getAll("logistics_provider"),
    );
    const allowedOrderFields = new Set([
      "created_at",
      "updated_at",
      "freight_unit_price",
      "volume",
      "extra_fee",
      "freight_paid_status",
    ]);

    const adminClient = createSupabaseAdminClient();
    let matchedShipmentIds: string[] | null = null;

    if (
      shipmentNoValues.length > 0 ||
      trackingNoValues.length > 0 ||
      productNameValues.length > 0 ||
      logisticsProviderValues.length > 0
    ) {
      let shipmentQuery = adminClient
        .from("shipment_records")
        .select("id")
        .eq("status", "有效");

      if (shipmentNoValues.length > 0) {
        shipmentQuery = shipmentQuery.in("shipment_no", shipmentNoValues);
      }

      if (trackingNoValues.length > 0) {
        shipmentQuery = shipmentQuery.in("tracking_no", trackingNoValues);
      }

      if (productNameValues.length > 0) {
        shipmentQuery = shipmentQuery.in("product_name", productNameValues);
      }

      if (logisticsProviderValues.length > 0) {
        shipmentQuery = shipmentQuery.in(
          "logistics_provider",
          logisticsProviderValues,
        );
      }

      const { data: shipmentRows, error: shipmentError } = await shipmentQuery;

      if (shipmentError) {
        throw shipmentError;
      }

      matchedShipmentIds = (shipmentRows ?? [])
        .map((item) => item.id)
        .filter((item): item is string => Boolean(item));
    }

    if (matchedShipmentIds && matchedShipmentIds.length === 0) {
      return NextResponse.json({
        data: [],
        total: 0,
      });
    }

    let query = adminClient
      .from("freight_records")
      .select(
        "id, shipment_record_id, freight_unit_price, volume, extra_fee, freight_paid_status, created_at, updated_at, shipment:shipment_records(shipment_no, tracking_no, logistics_provider, product_name, box_count, total_qty)",
        { count: "exact" },
      )
      .range(from, to);

    if (matchedShipmentIds && matchedShipmentIds.length > 0) {
      query = query.in("shipment_record_id", matchedShipmentIds);
    }

    query = query.order(
      allowedOrderFields.has(orderField) ? orderField : "created_at",
      {
        ascending: orderDirection === "ascend",
        nullsFirst: false,
      },
    );

    const { data, error, count } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      data: ((data ?? []) as FreightRow[]).map(normalizeFreightRow),
      total: count ?? 0,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "运费列表读取失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    await verifyOperator();

    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      throw new Error("缺少运费记录ID");
    }

    const adminClient = createSupabaseAdminClient();
    const { data, error } = await adminClient
      .from("freight_records")
      .update({
        freight_unit_price: normalizeNumberValue(body.freight_unit_price),
        volume: normalizeNumberValue(body.volume),
        extra_fee: normalizeNumberValue(body.extra_fee),
        freight_paid_status:
          normalizeTextValue(body.freight_paid_status) ?? "否",
      })
      .eq("id", id)
      .select(
        "id, shipment_record_id, freight_unit_price, volume, extra_fee, freight_paid_status, created_at, updated_at, shipment:shipment_records(shipment_no, tracking_no, logistics_provider, product_name, box_count, total_qty)",
      )
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ data: normalizeFreightRow(data as FreightRow) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "运费信息修改失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
