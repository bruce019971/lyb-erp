import {
  calculateFreightTotalFee,
  calculateFreightUnitFee,
  type FreightRecord,
  type FreightUpdateValues,
} from "./freights";

type FreightRequestParams = {
  current?: number;
  pageSize?: number;
} & Record<string, unknown>;

function normalizeMultiSelectValues(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export async function requestFreightRecords(params: FreightRequestParams) {
  const searchParams = new URLSearchParams({
    current: String(params.current ?? 1),
    pageSize: String(params.pageSize ?? 40),
  });

  normalizeMultiSelectValues(params.shipment_no).forEach((value) => {
    searchParams.append("shipment_no", value);
  });
  normalizeMultiSelectValues(params.logistics_provider).forEach((value) => {
    searchParams.append("logistics_provider", value);
  });

  const response = await fetch(`/api/freights?${searchParams.toString()}`);
  const payload = (await response.json().catch(() => null)) as
    | { data?: FreightRecord[]; total?: number; error?: string }
    | null;

  if (!response.ok) {
    return { data: [], success: false, total: 0 };
  }

  return {
    data: payload?.data ?? [],
    success: true,
    total: payload?.total ?? 0,
  };
}

function normalizeNumberValue(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeTextValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function updateFreightRecord(
  id: string,
  values: FreightUpdateValues,
) {
  const freightUnitPrice = normalizeNumberValue(values.freight_unit_price);
  const volume = normalizeNumberValue(values.volume);

  const response = await fetch("/api/freights", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id,
      freight_unit_price: freightUnitPrice,
      volume,
      freight_paid_status: normalizeTextValue(values.freight_paid_status) ?? "否",
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: FreightRecord; error?: string }
    | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error || "运费信息修改失败");
  }

  return {
    ...payload.data,
    total_fee: calculateFreightTotalFee(
      payload.data.freight_unit_price,
      payload.data.volume,
    ),
    unit_fee: calculateFreightUnitFee(
      calculateFreightTotalFee(
        payload.data.freight_unit_price,
        payload.data.volume,
      ),
      payload.data.total_qty,
    ),
  };
}
