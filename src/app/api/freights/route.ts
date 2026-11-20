import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getPageRange } from "@/lib/table-pagination";
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
        order_store: string | null;
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
        order_store: string | null;
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
  "id, shipment_record_id, freight_unit_price, volume, extra_fee, extra_fee_remark, total_fee, bill_amount, freight_paid_status, created_at, updated_at, shipment:shipment_records!inner(shipment_no, tracking_no, logistics_provider, product_name, order_store, overseas_warehouse_arrived_at, box_count, total_qty, created_at)";
const FREIGHT_SELECT =
  "id, shipment_record_id, freight_unit_price, volume, extra_fee, total_fee, bill_amount, freight_paid_status, created_at, updated_at, shipment:shipment_records!inner(shipment_no, tracking_no, logistics_provider, product_name, order_store, overseas_warehouse_arrived_at, box_count, total_qty, created_at)";
const FREIGHT_PATCH_SELECT_WITH_EXTRA_FEE_REMARK =
  "id, shipment_record_id, freight_unit_price, volume, extra_fee, extra_fee_remark, total_fee, bill_amount, freight_paid_status, created_at, updated_at, shipment:shipment_records(shipment_no, tracking_no, logistics_provider, product_name, order_store, overseas_warehouse_arrived_at, box_count, total_qty, created_at)";
const FREIGHT_PATCH_SELECT =
  "id, shipment_record_id, freight_unit_price, volume, extra_fee, total_fee, bill_amount, freight_paid_status, created_at, updated_at, shipment:shipment_records(shipment_no, tracking_no, logistics_provider, product_name, order_store, overseas_warehouse_arrived_at, box_count, total_qty, created_at)";
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
    order_store: shipment?.order_store ?? null,
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

function addSummaryValue(summary: FreightSummary, row: FreightSummary) {
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

interface FreightSearchQuery {
  eq(field: string, value: string): unknown;
  in(field: string, values: string[]): unknown;
  gte(field: string, value: string): unknown;
  lte(field: string, value: string): unknown;
  not(field: string, operator: string, value: null): unknown;
  is(field: string, value: null): unknown;
  or(filters: string): unknown;
}

async function getFreightFilterOptions(
  searchParams: URLSearchParams,
  adminClient: ReturnType<typeof createSupabaseAdminClient>,
) {
  const field = searchParams.get("field");
  const keyword = searchParams.get("keyword")?.trim() ?? "";
  let values: string[];
  if (field === "order_store" || field === "product_name") {
    // Reuse the distinct values view introduced with shipment pagination.
    const column = field === "order_store" ? "order_stores" : "product_names";
    const { data, error } = await adminClient.from("shipment_track_filter_options")
      .select(column).single();
    if (error) throw error;
    values = ((data as unknown as Record<string, string[]>)[column] ?? [])
      .filter((value) => value.toLowerCase().includes(keyword.toLowerCase()));
  } else if (field === "shipment_no" || field === "tracking_no") {
    let query = adminClient.from("shipment_records").select(field)
      .eq("status", "有效").not(field, "is", null)
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true }).limit(50);
    if (keyword) query = query.ilike(field, `%${keyword}%`);
    const { data, error } = await query;
    if (error) throw error;
    values = (data as unknown as Record<string, string>[] ?? []).map((row) => row[field]);
  } else {
    throw new Error("不支持的筛选字段");
  }
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
    .map((value) => ({ label: value, value }));
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
    const orderStoreValues = splitSearchTexts(
      searchParams.getAll("order_store"),
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
    if (searchParams.get("mode") === "options") {
      return NextResponse.json({ options: await getFreightFilterOptions(searchParams, adminClient) });
    }

    function applyFilters(query: FreightSearchQuery) {
      query.eq("shipment.status", "有效");
      for (const [field, values] of Object.entries({
        shipment_no: shipmentNoValues, tracking_no: trackingNoValues,
        product_name: productNameValues, order_store: orderStoreValues,
        logistics_provider: logisticsProviderValues,
      })) {
        if (values.length) query.in(`shipment.${field}`, values);
      }
      if (createdAtStart) query.gte("shipment.created_at", normalizeCreatedAtBoundary(createdAtStart, "start"));
      if (createdAtEnd) query.lte("shipment.created_at", normalizeCreatedAtBoundary(createdAtEnd, "end"));
      if (billIssuedValues.includes("是") && !billIssuedValues.includes("否")) {
        query.not("bill_amount", "is", null);
      } else if (billIssuedValues.includes("否") && !billIssuedValues.includes("是")) {
        query.is("bill_amount", null);
      }
      if (freightPaidStatusValues.includes("是") && !freightPaidStatusValues.includes("否")) {
        query.eq("freight_paid_status", "是");
      } else if (freightPaidStatusValues.includes("否") && !freightPaidStatusValues.includes("是")) {
        query.or("freight_paid_status.is.null,freight_paid_status.eq.否");
      }
    }

    // Totals are requested separately, contain only numeric fields, and are not
    // recomputed on page changes. Traverse all matches beyond the API row cap.
    if (searchParams.get("mode") === "summary") {
      const summary: FreightSummary = { volume: 0, total_fee: 0, bill_amount: 0 };
      let totalMatches = Infinity;
      const fields: string = "volume, total_fee, bill_amount, shipment:shipment_records!inner(id)";
      for (let from = 0; ; from += 1000) {
        const query = adminClient.from("freight_records").select(fields, {
          count: from === 0 ? "exact" : undefined,
        });
        applyFilters(query);
        const { data, error, count } = await query
          .order("id", { ascending: true }).range(from, from + 999);
        if (error) throw error;
        if (count !== null) totalMatches = count;
        const rows = (data ?? []) as unknown as FreightSummary[];
        rows.forEach((row) => addSummaryValue(summary, row));
        if (rows.length < 1000 || from + rows.length >= totalMatches) break;
      }
      return NextResponse.json({ summary: normalizeSummary(summary) });
    }

    const { from, to } = getPageRange({
      current: searchParams.has("current") ? Number(searchParams.get("current")) : undefined,
      pageSize: searchParams.has("pageSize") ? Number(searchParams.get("pageSize")) : undefined,
    });
    // Displayed order time belongs to the shipment, not the freight record.
    const ascending = searchParams.get("sortField") === "created_at" && searchParams.get("sortOrder") === "ascend";
    const makeListQuery = (includeExtraFeeRemark: boolean) => {
      const fields: string = includeExtraFeeRemark ? FREIGHT_SELECT_WITH_EXTRA_FEE_REMARK : FREIGHT_SELECT;
      const query = adminClient.from("freight_records").select(fields, { count: "exact" });
      applyFilters(query);
      return query.order("shipment(created_at)", { ascending, nullsFirst: false })
        .order("id", { ascending: true }).returns<FreightRow[]>();
    };

    let includeExtraFeeRemark = true;
    let listQuery = makeListQuery(includeExtraFeeRemark);
    let result = await listQuery.range(from, to);
    if (isMissingExtraFeeRemarkError(result.error)) {
      includeExtraFeeRemark = false;
      listQuery = makeListQuery(includeExtraFeeRemark);
      result = await listQuery.range(from, to);
    }
    // Let the table move back to the last page after rows cease matching.
    if (result.error?.code === "PGRST103") {
      const first = await listQuery.range(0, 0);
      if (first.error) throw first.error;
      return NextResponse.json({ data: [], total: first.count ?? 0 });
    }
    const { data, error, count } = result;
    if (error) throw error;
    const records = ((data ?? []) as unknown as FreightRow[]).map(normalizeFreightRow);
    const recordsWithSaleasyPlanInfo = await appendSaleasyPlanInfo(
      records,
      adminClient,
      shipmentNoValues.length > 0 || trackingNoValues.length > 0,
    );

    return NextResponse.json({
      data: recordsWithSaleasyPlanInfo,
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
