import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  SALEASY_TRANSPORT_PLAN_LIST_PATH,
  extractRows,
  getOptionalNumber,
  getOptionalText,
  getRequiredText,
  loginSaleasy,
  normalizeSaleasyBaseUrl,
  requestSaleasyJson,
  toRecord,
} from "../shipments/_saleasy";

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
  extra_fee_remark: string | null;
  total_fee: number | null;
  bill_amount: number | null;
  freight_paid_status: string | null;
  created_at: string | null;
  updated_at: string | null;
  shipment:
    | {
        shipment_no: string | null;
        tracking_no: string | null;
        logistics_provider: string | null;
        product_name: string | null;
        overseas_warehouse_arrived_at: string | null;
        box_count: number | null;
        total_qty: number | null;
        created_at: string | null;
    }
    | Array<{
        shipment_no: string | null;
        tracking_no: string | null;
        logistics_provider: string | null;
        product_name: string | null;
        overseas_warehouse_arrived_at: string | null;
        box_count: number | null;
        total_qty: number | null;
        created_at: string | null;
      }>
    | null;
};

type FreightSummary = {
  volume: number;
  total_fee: number;
  bill_amount: number;
};

type FreightPaymentStatusRow = {
  bill_amount: number | null;
  freight_paid_status: string | null;
  shipment:
    | {
        logistics_provider: string | null;
      }
    | Array<{
        logistics_provider: string | null;
      }>
    | null;
};

type LogisticsProviderRow = {
  system_url: string | null;
  username: string | null;
  password: string | null;
};

type SaleasyPlanInfo = {
  planStatus: number | null;
  transportPlanId: string | null;
  totalAmount: number | null;
};

const FREIGHT_SELECT_WITH_EXTRA_FEE_REMARK =
  "id, shipment_record_id, freight_unit_price, volume, extra_fee, extra_fee_remark, total_fee, bill_amount, freight_paid_status, created_at, updated_at, shipment:shipment_records!inner(shipment_no, tracking_no, logistics_provider, product_name, overseas_warehouse_arrived_at, box_count, total_qty, created_at)";
const FREIGHT_SELECT =
  "id, shipment_record_id, freight_unit_price, volume, extra_fee, total_fee, bill_amount, freight_paid_status, created_at, updated_at, shipment:shipment_records!inner(shipment_no, tracking_no, logistics_provider, product_name, overseas_warehouse_arrived_at, box_count, total_qty, created_at)";
const FREIGHT_PATCH_SELECT_WITH_EXTRA_FEE_REMARK =
  "id, shipment_record_id, freight_unit_price, volume, extra_fee, extra_fee_remark, total_fee, bill_amount, freight_paid_status, created_at, updated_at, shipment:shipment_records(shipment_no, tracking_no, logistics_provider, product_name, overseas_warehouse_arrived_at, box_count, total_qty, created_at)";
const FREIGHT_PATCH_SELECT =
  "id, shipment_record_id, freight_unit_price, volume, extra_fee, total_fee, bill_amount, freight_paid_status, created_at, updated_at, shipment:shipment_records(shipment_no, tracking_no, logistics_provider, product_name, overseas_warehouse_arrived_at, box_count, total_qty, created_at)";
const SALEASY_LOG_SCOPE = "freights-saleasy-plan-status";

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

  return Number((totalFee / totalQty).toFixed(2));
}

function normalizeFreightRow(row: FreightRow) {
  const shipment = Array.isArray(row.shipment) ? row.shipment[0] : row.shipment;

  return {
    id: row.id,
    shipment_record_id: row.shipment_record_id,
    shipment_no: shipment?.shipment_no ?? null,
    tracking_no: shipment?.tracking_no ?? null,
    logistics_provider: shipment?.logistics_provider ?? null,
    product_name: shipment?.product_name ?? null,
    overseas_warehouse_arrived_at:
      shipment?.overseas_warehouse_arrived_at ?? null,
    freight_unit_price: row.freight_unit_price,
    volume: row.volume,
    extra_fee: row.extra_fee,
    extra_fee_remark: row.extra_fee_remark ?? null,
    box_count: shipment?.box_count ?? null,
    total_qty: shipment?.total_qty ?? null,
    total_fee: row.total_fee,
    bill_amount: row.bill_amount,
    unit_fee: calculateFreightUnitFee(row.total_fee, shipment?.total_qty ?? null),
    freight_paid_status: row.freight_paid_status ?? "否",
    saleasy_plan_status: null,
    saleasy_transport_plan_id: null,
    saleasy_total_amount: null,
    created_at: shipment?.created_at ?? row.created_at,
    updated_at: row.updated_at,
  };
}

function getFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function addSummaryValue(summary: FreightSummary, row: FreightRow) {
  summary.volume += getFiniteNumber(row.volume);
  summary.total_fee += getFiniteNumber(row.total_fee);
  summary.bill_amount += getFiniteNumber(row.bill_amount);
}

function normalizeSummary(summary: FreightSummary): FreightSummary {
  return {
    volume: Number(summary.volume.toFixed(3)),
    total_fee: Number(summary.total_fee.toFixed(2)),
    bill_amount: Number(summary.bill_amount.toFixed(2)),
  };
}

function normalizeNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeTextValue(value: unknown) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

function hasBillAmount(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;

  const trimmed = value.trim();
  return trimmed !== "" && Number.isFinite(Number(trimmed));
}

function normalizeFreightPaidStatus(value: unknown) {
  return normalizeTextValue(value) ?? "否";
}

function calculateTotalFee(values: {
  freight_unit_price: number | null;
  volume: number | null;
  extra_fee: number | null;
}) {
  if (
    typeof values.freight_unit_price !== "number" ||
    !Number.isFinite(values.freight_unit_price) ||
    typeof values.volume !== "number" ||
    !Number.isFinite(values.volume)
  ) {
    return null;
  }

  const extraFee =
    typeof values.extra_fee === "number" && Number.isFinite(values.extra_fee)
      ? values.extra_fee
      : 0;

  return Number((values.freight_unit_price * values.volume + extraFee).toFixed(2));
}

function hasOwnKey(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
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

function normalizeDateRangeValues(values: string[]) {
  return values.map((item) => item.trim()).filter(Boolean).slice(0, 2);
}

function normalizeCreatedAtBoundary(value: string, boundary: "start" | "end") {
  return boundary === "start"
    ? `${value}T00:00:00`
    : `${value}T23:59:59.999`;
}

function isMissingExtraFeeRemarkError(error: unknown) {
  const text = JSON.stringify(error);

  return (
    text.includes("extra_fee_remark") &&
    /does not exist|could not find|schema cache|PGRST204|42703/i.test(text)
  );
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

function normalizeSaleasyFieldKey(key: string) {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function getRecursiveFieldText(
  value: unknown,
  normalizedFieldNames: readonly string[],
  depth = 0,
): string {
  if (!value || depth > 4) return "";

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = getRecursiveFieldText(
        item,
        normalizedFieldNames,
        depth + 1,
      );
      if (result) return result;
    }

    return "";
  }

  const record = toRecord(value);
  if (!record) return "";

  for (const [key, item] of Object.entries(record)) {
    if (!normalizedFieldNames.includes(normalizeSaleasyFieldKey(key))) {
      continue;
    }

    const text = getOptionalText(item);
    if (text) return text;
  }

  for (const item of Object.values(record)) {
    const result = getRecursiveFieldText(
      item,
      normalizedFieldNames,
      depth + 1,
    );
    if (result) return result;
  }

  return "";
}

function getRecursiveFieldNumber(
  value: unknown,
  normalizedFieldNames: readonly string[],
  depth = 0,
): number | undefined {
  if (!value || depth > 4) return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = getRecursiveFieldNumber(
        item,
        normalizedFieldNames,
        depth + 1,
      );
      if (result !== undefined) return result;
    }

    return undefined;
  }

  const record = toRecord(value);
  if (!record) return undefined;

  for (const [key, item] of Object.entries(record)) {
    if (!normalizedFieldNames.includes(normalizeSaleasyFieldKey(key))) {
      continue;
    }

    const numberValue = getOptionalNumber(item);
    if (numberValue !== undefined) return numberValue;
  }

  for (const item of Object.values(record)) {
    const result = getRecursiveFieldNumber(
      item,
      normalizedFieldNames,
      depth + 1,
    );
    if (result !== undefined) return result;
  }

  return undefined;
}

function getSaleasyPlanInfo(row: unknown): SaleasyPlanInfo {
  const planStatus =
    getRecursiveFieldNumber(row, [
      "planstatus",
      "status",
      "transportplanstatus",
    ]) ??
    null;
  const totalAmount =
    getRecursiveFieldNumber(row, ["totalamount", "payfee", "totalfee"]) ??
    null;
  const transportPlanId =
    getRecursiveFieldText(row, ["id", "planid", "transportplanid"]) || null;

  return {
    planStatus,
    transportPlanId,
    totalAmount,
  };
}

function normalizeComparableText(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function recordContainsText(value: unknown, keyword: string): boolean {
  const normalizedKeyword = normalizeComparableText(keyword);
  if (!normalizedKeyword) return false;

  if (typeof value === "string" || typeof value === "number") {
    return normalizeComparableText(String(value)).includes(normalizedKeyword);
  }

  if (Array.isArray(value)) {
    return value.some((item) => recordContainsText(item, keyword));
  }

  const record = toRecord(value);
  if (!record) return false;

  return Object.values(record).some((item) => recordContainsText(item, keyword));
}

function findSaleasyTransportPlanRow(
  rows: unknown[],
  params: {
    shipmentNo: string;
    trackingNo: string;
  },
) {
  const normalizedShipmentNo = normalizeComparableText(params.shipmentNo);
  const normalizedTrackingNo = normalizeComparableText(params.trackingNo);
  const matchedByTrackingNo = rows.find((row) => {
    if (!normalizedTrackingNo) return false;

    const trackingField = getRecursiveFieldText(row, [
      "planno",
      "transportplanno",
      "transportplannumber",
      "trackingno",
      "trackingnumber",
      "waybillno",
      "waybillnumber",
      "logisticsno",
      "logisticsnumber",
    ]);

    return (
      trackingField &&
      normalizeComparableText(trackingField) === normalizedTrackingNo
    );
  });

  if (matchedByTrackingNo) return matchedByTrackingNo;

  const matchedByField = rows.find((row) => {
    if (!normalizedShipmentNo) return false;

    const shipmentField = getRecursiveFieldText(row, [
      "mcdshipmentid",
      "planname",
      "shipmentno",
    ]);

    return (
      shipmentField &&
      normalizeComparableText(shipmentField) === normalizedShipmentNo
    );
  });

  if (matchedByField) return matchedByField;

  if (params.trackingNo) {
    const matchedByTrackingText = rows.find((row) =>
      recordContainsText(row, params.trackingNo),
    );

    if (matchedByTrackingText) return matchedByTrackingText;
  }

  if (params.shipmentNo) {
    return rows.find((row) => recordContainsText(row, params.shipmentNo));
  }

  return undefined;
}

function buildSaleasyTransportPlanListPayload(shipmentNo: string) {
  return {
    operateType: 1,
    queryTimeType: 1,
    searchKey: shipmentNo,
    destinationType: 4,
    logisticsScheme: null,
    isInsure: null,
    fromCountryId: null,
    fromCityId: null,
    toCountryId: null,
    toCityId: null,
    startCreationTime: null,
    endCreationTime: null,
    planStatuses: [],
    isRefund: null,
    isLoseMoney: null,
    inOrOutWarehouseNo: null,
    currentIndex: 1,
    skipCount: 0,
    isNeedTransportBoxesTotal: true,
    maxResultCount: 10,
    sorting: null,
    planNoes: [],
  };
}

async function appendSaleasyPlanInfo(
  records: ReturnType<typeof normalizeFreightRow>[],
  adminClient: ReturnType<typeof createSupabaseAdminClient>,
  enabled: boolean,
) {
  if (!enabled) return records;

  const saleasyRecords = records.filter(
    (record) =>
      record.logistics_provider?.trim() === "赛易" &&
      (record.shipment_no?.trim() || record.tracking_no?.trim()),
  );

  if (!saleasyRecords.length) return records;

  const { data: logisticsData, error: logisticsError } = await adminClient
    .from("logistics_providers")
    .select("system_url, username, password")
    .eq("provider_name", "赛易")
    .single();

  if (logisticsError) {
    console.error("[freights-saleasy-plan-status] logistics lookup failed", logisticsError);
    return records;
  }

  try {
    const logisticsProvider = logisticsData as LogisticsProviderRow;
    const baseUrl = normalizeSaleasyBaseUrl(logisticsProvider.system_url);
    const username = getRequiredText(
      logisticsProvider.username,
      "赛易物流商用户名未配置",
    );
    const password = getRequiredText(
      logisticsProvider.password,
      "赛易物流商密码未配置",
    );
    const token = await loginSaleasy({
      baseUrl,
      username,
      password,
      logScope: SALEASY_LOG_SCOPE,
    });
    const planInfoByFreightId = new Map<string, SaleasyPlanInfo>();

    await Promise.all(
      saleasyRecords.map(async (record) => {
        const shipmentNo = record.shipment_no?.trim();
        const trackingNo = record.tracking_no?.trim();
        const searchKey = shipmentNo || trackingNo;

        if (!searchKey) return;

        try {
          const result = await requestSaleasyJson<unknown>({
            baseUrl,
            path: SALEASY_TRANSPORT_PLAN_LIST_PATH,
            token,
            body: buildSaleasyTransportPlanListPayload(searchKey),
            logScope: SALEASY_LOG_SCOPE,
            label: "transport plan list response",
            fallbackError: "赛易运输计划列表查询失败",
          });
          const rows = extractRows(result);
          const row = findSaleasyTransportPlanRow(rows, {
            shipmentNo: shipmentNo || "",
            trackingNo: trackingNo || "",
          });

          if (row) {
            planInfoByFreightId.set(record.id, getSaleasyPlanInfo(row));
          }
        } catch (error) {
          console.error("[freights-saleasy-plan-status] plan lookup failed", {
            freightId: record.id,
            searchKey,
            error,
          });
        }
      }),
    );

    return records.map((record) => {
      const planInfo = planInfoByFreightId.get(record.id);
      if (!planInfo) return record;

      return {
        ...record,
        saleasy_plan_status: planInfo.planStatus,
        saleasy_transport_plan_id: planInfo.transportPlanId,
        saleasy_total_amount: planInfo.totalAmount,
      };
    });
  } catch (error) {
    console.error("[freights-saleasy-plan-status] lookup skipped", error);
    return records;
  }
}

export async function GET(request: Request) {
  try {
    await verifyOperator();

    const { searchParams } = new URL(request.url);
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
    const [createdAtStart, createdAtEnd] = normalizeDateRangeValues(
      searchParams.getAll("created_at"),
    );
    const billIssuedValues = normalizeMultiSelectValues(
      searchParams.getAll("bill_issued"),
    );
    const freightPaidStatusValues = normalizeMultiSelectValues(
      searchParams.getAll("freight_paid_status"),
    );
    const adminClient = createSupabaseAdminClient();
    let matchedShipmentIds: string[] | null = null;

    if (
      shipmentNoValues.length > 0 ||
      trackingNoValues.length > 0 ||
      productNameValues.length > 0 ||
      logisticsProviderValues.length > 0 ||
      Boolean(createdAtStart) ||
      Boolean(createdAtEnd)
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

      if (createdAtStart) {
        shipmentQuery = shipmentQuery.gte(
          "created_at",
          normalizeCreatedAtBoundary(createdAtStart, "start"),
        );
      }

      if (createdAtEnd) {
        shipmentQuery = shipmentQuery.lte(
          "created_at",
          normalizeCreatedAtBoundary(createdAtEnd, "end"),
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
        summary: normalizeSummary({
          volume: 0,
          total_fee: 0,
          bill_amount: 0,
        }),
      });
    }

    const runFreightQueries = async (includeExtraFeeRemark: boolean) => {
      const selectFields = includeExtraFeeRemark
        ? FREIGHT_SELECT_WITH_EXTRA_FEE_REMARK
        : FREIGHT_SELECT;
      let query = adminClient
        .from("freight_records")
        .select(selectFields, { count: "exact" })
        .eq("shipment.status", "有效");
      let summaryQuery = adminClient
        .from("freight_records")
        .select(selectFields)
        .eq("shipment.status", "有效");

      if (matchedShipmentIds && matchedShipmentIds.length > 0) {
        query = query.in("shipment_record_id", matchedShipmentIds);
        summaryQuery = summaryQuery.in("shipment_record_id", matchedShipmentIds);
      }

      if (billIssuedValues.includes("是") && !billIssuedValues.includes("否")) {
        query = query.not("bill_amount", "is", null);
        summaryQuery = summaryQuery.not("bill_amount", "is", null);
      } else if (
        billIssuedValues.includes("否") &&
        !billIssuedValues.includes("是")
      ) {
        query = query.is("bill_amount", null);
        summaryQuery = summaryQuery.is("bill_amount", null);
      }

      if (
        freightPaidStatusValues.includes("是") &&
        !freightPaidStatusValues.includes("否")
      ) {
        query = query.eq("freight_paid_status", "是");
        summaryQuery = summaryQuery.eq("freight_paid_status", "是");
      } else if (
        freightPaidStatusValues.includes("否") &&
        !freightPaidStatusValues.includes("是")
      ) {
        query = query.or("freight_paid_status.is.null,freight_paid_status.eq.否");
        summaryQuery = summaryQuery.or(
          "freight_paid_status.is.null,freight_paid_status.eq.否",
        );
      }

      return Promise.all([query, summaryQuery]);
    };

    let [listResult, summaryResult] = await runFreightQueries(true);

    if (
      isMissingExtraFeeRemarkError(listResult.error) ||
      isMissingExtraFeeRemarkError(summaryResult.error)
    ) {
      [listResult, summaryResult] = await runFreightQueries(false);
    }
    const { data, error, count } = listResult;

    if (error) {
      throw error;
    }

    if (summaryResult.error) {
      throw summaryResult.error;
    }

    const summary = ((summaryResult.data ?? []) as unknown as FreightRow[]).reduce(
      (result, row) => {
        addSummaryValue(result, row);
        return result;
      },
      {
        volume: 0,
        total_fee: 0,
        bill_amount: 0,
      },
    );

    const records = ((data ?? []) as unknown as FreightRow[])
      .map(normalizeFreightRow)
      .sort((left, right) => {
        const leftTime = left.created_at ? Date.parse(left.created_at) : 0;
        const rightTime = right.created_at ? Date.parse(right.created_at) : 0;

        return rightTime - leftTime;
      });
    const recordsWithSaleasyPlanInfo = await appendSaleasyPlanInfo(
      records,
      adminClient,
      shipmentNoValues.length > 0 || trackingNoValues.length > 0,
    );

    return NextResponse.json({
      data: recordsWithSaleasyPlanInfo,
      total: count ?? 0,
      summary: normalizeSummary(summary),
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
    const freightUnitPrice = normalizeNumberValue(body.freight_unit_price);
    const volume = normalizeNumberValue(body.volume);
    const extraFee = normalizeNumberValue(body.extra_fee);
    const totalFee =
      calculateTotalFee({
        freight_unit_price: freightUnitPrice,
        volume,
        extra_fee: extraFee,
      }) ?? normalizeNumberValue(body.total_fee);
    const hasPaidStatusInput = hasOwnKey(body, "freight_paid_status");
    const { data: currentFreight, error: currentFreightError } =
      await adminClient
        .from("freight_records")
        .select("bill_amount, freight_paid_status, shipment:shipment_records(logistics_provider)")
        .eq("id", id)
        .single();

    if (currentFreightError) {
      throw currentFreightError;
    }

    const currentFreightRow = currentFreight as FreightPaymentStatusRow;
    const currentPaidStatus = normalizeFreightPaidStatus(
      currentFreightRow.freight_paid_status,
    );
    const freightPaidStatus = hasPaidStatusInput
      ? normalizeFreightPaidStatus(body.freight_paid_status)
      : currentPaidStatus;
    const currentShipment = Array.isArray(currentFreightRow.shipment)
      ? currentFreightRow.shipment[0]
      : currentFreightRow.shipment;
    const isTangchaoFreight =
      currentShipment?.logistics_provider?.trim() === "唐朝";

    if (
      freightPaidStatus !== currentPaidStatus &&
      !hasBillAmount(currentFreightRow.bill_amount) &&
      !isTangchaoFreight
    ) {
      throw new Error("账单金额为空时不能更改是否支付");
    }

    if (currentPaidStatus === "是" && freightPaidStatus !== "是") {
      throw new Error("已支付状态不可更改");
    }

    const updatePayload = {
      freight_unit_price: freightUnitPrice,
      volume,
      extra_fee: extraFee,
      total_fee: totalFee,
      freight_paid_status: freightPaidStatus,
    };
    const updateFreight = (selectFields: string) =>
      adminClient
        .from("freight_records")
        .update(updatePayload)
        .eq("id", id)
        .select(selectFields)
        .single();
    let { data, error } = await updateFreight(
      FREIGHT_PATCH_SELECT_WITH_EXTRA_FEE_REMARK,
    );

    if (isMissingExtraFeeRemarkError(error)) {
      const fallbackResult = await updateFreight(FREIGHT_PATCH_SELECT);
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      throw error;
    }

    return NextResponse.json({
      data: normalizeFreightRow(data as unknown as FreightRow),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "运费信息修改失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
