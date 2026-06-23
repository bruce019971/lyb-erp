import {
  calculateFreightTotalFee,
  calculateFreightUnitFee,
  type FreightRecord,
  type FreightSummary,
  type FreightUpdateValues,
} from "./freights";

type FreightRequestParams = {
  current?: number;
  pageSize?: number;
} & Record<string, unknown>;

export type FreightVolumeBox = {
  packno?: string;
  width?: number | null;
  length?: number | null;
  height?: number | null;
  yjf_weit?: number | null;
};

function normalizeMultiSelectValues(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizeSelectValues(value: unknown) {
  const values = Array.isArray(value) ? value : [value];

  return values
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizeDateRangeValues(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) =>
      typeof item === "string" ? item.trim() : String(item ?? "").trim(),
    )
    .filter(Boolean)
    .slice(0, 2);
}

function splitSearchTexts(value: unknown) {
  const values = Array.isArray(value) ? value : [value];

  return values
    .flatMap((item) =>
      typeof item === "string" ? item.split(/[\s,，]+/) : [],
    )
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function requestFreightRecords(params: FreightRequestParams) {
  const searchParams = new URLSearchParams();

  splitSearchTexts(params.shipment_no).forEach((value) => {
    searchParams.append("shipment_no", value);
  });
  splitSearchTexts(params.tracking_no).forEach((value) => {
    searchParams.append("tracking_no", value);
  });
  splitSearchTexts(params.product_name).forEach((value) => {
    searchParams.append("product_name", value);
  });
  normalizeMultiSelectValues(params.logistics_provider).forEach((value) => {
    searchParams.append("logistics_provider", value);
  });
  normalizeDateRangeValues(params.created_at).forEach((value) => {
    searchParams.append("created_at", value);
  });
  normalizeSelectValues(params.bill_issued).forEach((value) => {
    searchParams.append("bill_issued", value);
  });
  normalizeSelectValues(params.freight_paid_status).forEach((value) => {
    searchParams.append("freight_paid_status", value);
  });

  const response = await fetch(`/api/freights?${searchParams.toString()}`);
  const payload = (await response.json().catch(() => null)) as
    | {
        data?: FreightRecord[];
        total?: number;
        summary?: FreightSummary;
        error?: string;
      }
    | null;

  if (!response.ok) {
    return { data: [], success: false, total: 0, summary: null };
  }

  return {
    data: payload?.data ?? [],
    success: true,
    total: payload?.total ?? 0,
    summary: payload?.summary ?? null,
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
  const extraFee = normalizeNumberValue(values.extra_fee);
  const calculatedTotalFee = calculateFreightTotalFee({
    freight_unit_price: freightUnitPrice,
    volume,
    extra_fee: extraFee,
  });
  const totalFee = calculatedTotalFee ?? normalizeNumberValue(values.total_fee);
  const requestPayload: Record<string, unknown> = {
    id,
    freight_unit_price: freightUnitPrice,
    volume,
    extra_fee: extraFee,
    total_fee: totalFee,
  };
  const freightPaidStatus = normalizeTextValue(values.freight_paid_status);

  if (freightPaidStatus) {
    requestPayload.freight_paid_status = freightPaidStatus;
  }

  const response = await fetch("/api/freights", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestPayload),
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: FreightRecord; error?: string }
    | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error || "运费信息修改失败");
  }

  return {
    ...payload.data,
    unit_fee: calculateFreightUnitFee(
      payload.data.total_fee,
      payload.data.total_qty,
    ),
  };
}

export async function fetchRishenghuiFreightVolume(values: {
  freightId: string;
  accessToken: string;
}) {
  const response = await fetch("/api/freights/rishenghui-volume", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        volume?: number;
        matchedCount?: number;
        boxes?: FreightVolumeBox[];
        error?: string;
      }
    | null;

  if (!response.ok || typeof payload?.volume !== "number") {
    throw new Error(payload?.error || "日升辉方数获取失败");
  }

  return {
    volume: payload.volume,
    matchedCount: payload.matchedCount ?? 0,
    boxes: payload.boxes ?? [],
  };
}

export async function fetchTongtuFreightVolume(values: { freightId: string }) {
  const response = await fetch("/api/freights/tongtu-volume", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        volume?: number;
        matchedCount?: number;
        boxes?: FreightVolumeBox[];
        error?: string;
      }
    | null;

  if (!response.ok || typeof payload?.volume !== "number") {
    throw new Error(payload?.error || "通途方数获取失败");
  }

  return {
    volume: payload.volume,
    matchedCount: payload.matchedCount ?? 0,
    boxes: payload.boxes ?? [],
  };
}

export async function fetchSaleasyFreightVolume(values: { freightId: string }) {
  const response = await fetch("/api/freights/saleasy-volume", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        volume?: number;
        matchedCount?: number;
        boxes?: FreightVolumeBox[];
        error?: string;
      }
    | null;

  if (!response.ok || typeof payload?.volume !== "number") {
    throw new Error(payload?.error || "赛易方数获取失败");
  }

  return {
    volume: payload.volume,
    matchedCount: payload.matchedCount ?? 0,
    boxes: payload.boxes ?? [],
  };
}

export async function fetchRishenghuiFreightBill(values: {
  freightId: string;
  accessToken: string;
}) {
  const response = await fetch("/api/freights/rishenghui-bill", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        billAmount?: number;
        totalFee?: number;
        isConsistent?: boolean;
        matchedCount?: number;
        error?: string;
      }
    | null;

  if (!response.ok || typeof payload?.billAmount !== "number") {
    throw new Error(payload?.error || "日升辉账单获取失败");
  }

  return {
    billAmount: payload.billAmount,
    totalFee: payload.totalFee,
    isConsistent: payload.isConsistent ?? false,
    matchedCount: payload.matchedCount ?? 0,
  };
}

export async function fetchRishenghuiFreightUnitPrice(values: {
  freightId: string;
  accessToken: string;
  overwrite?: boolean;
}) {
  const response = await fetch("/api/freights/rishenghui-unit-price", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        unitPrice?: number;
        currentUnitPrice?: number | null;
        totalFee?: number | null;
        billCode?: string;
        matchedCount?: number;
        detailCount?: number;
        requiresOverwrite?: boolean;
        updated?: boolean;
        error?: string;
      }
    | null;

  if (!response.ok || typeof payload?.unitPrice !== "number") {
    throw new Error(payload?.error || "日升辉运费单价获取失败");
  }

  return {
    unitPrice: payload.unitPrice,
    currentUnitPrice: payload.currentUnitPrice ?? null,
    totalFee: payload.totalFee ?? null,
    billCode: payload.billCode ?? "",
    matchedCount: payload.matchedCount ?? 0,
    detailCount: payload.detailCount ?? 0,
    requiresOverwrite: payload.requiresOverwrite ?? false,
    updated: payload.updated ?? false,
  };
}

export async function fetchSaleasyFreightBill(values: { freightId: string }) {
  const response = await fetch("/api/freights/saleasy-bill", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        billAmount?: number;
        totalFee?: number;
        isConsistent?: boolean;
        matchedCount?: number;
        error?: string;
      }
    | null;

  if (!response.ok || typeof payload?.billAmount !== "number") {
    throw new Error(payload?.error || "赛易账单获取失败");
  }

  return {
    billAmount: payload.billAmount,
    totalFee: payload.totalFee,
    isConsistent: payload.isConsistent ?? false,
    matchedCount: payload.matchedCount ?? 0,
  };
}

export async function fetchSaleasyFreightExtraFee(values: {
  freightId: string;
  overwrite?: boolean;
}) {
  const response = await fetch("/api/freights/saleasy-extra-fee", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        extraFee?: number;
        extraFeeRemark?: string;
        currentExtraFee?: number | null;
        totalFee?: number | null;
        transportPlanId?: string;
        matchedCount?: number;
        requiresOverwrite?: boolean;
        updated?: boolean;
        error?: string;
      }
    | null;

  if (!response.ok || typeof payload?.extraFee !== "number") {
    throw new Error(payload?.error || "赛易额外费用获取失败");
  }

  return {
    extraFee: payload.extraFee,
    extraFeeRemark: payload.extraFeeRemark ?? "",
    currentExtraFee: payload.currentExtraFee ?? null,
    totalFee: payload.totalFee ?? null,
    transportPlanId: payload.transportPlanId ?? "",
    matchedCount: payload.matchedCount ?? 0,
    requiresOverwrite: payload.requiresOverwrite ?? false,
    updated: payload.updated ?? false,
  };
}

export async function confirmSaleasyFreightTotalFee(values: {
  freightId: string;
}) {
  const response = await fetch("/api/freights/saleasy-confirm-total-fee", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        transportPlanId?: string;
        payFee?: number;
        error?: string;
      }
    | null;

  if (!response.ok || !payload?.transportPlanId) {
    throw new Error(payload?.error || "赛易总费用确认失败");
  }

  return {
    transportPlanId: payload.transportPlanId,
    payFee: payload.payFee ?? null,
  };
}

export async function fetchTongtuFreightBill(values: { freightId: string }) {
  const response = await fetch("/api/freights/tongtu-bill", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        billAmount?: number;
        totalFee?: number;
        isConsistent?: boolean;
        matchedCount?: number;
        error?: string;
      }
    | null;

  if (!response.ok || typeof payload?.billAmount !== "number") {
    throw new Error(payload?.error || "通途账单获取失败");
  }

  return {
    billAmount: payload.billAmount,
    totalFee: payload.totalFee,
    isConsistent: payload.isConsistent ?? false,
    matchedCount: payload.matchedCount ?? 0,
  };
}

export async function fetchTangchaoFreightBill(values: { freightId: string }) {
  const response = await fetch("/api/freights/tangchao-bill", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        billAmount?: number;
        totalFee?: number;
        isConsistent?: boolean;
        matchedCount?: number;
        error?: string;
      }
    | null;

  if (!response.ok || typeof payload?.billAmount !== "number") {
    throw new Error(payload?.error || "唐朝账单获取失败");
  }

  return {
    billAmount: payload.billAmount,
    totalFee: payload.totalFee,
    isConsistent: payload.isConsistent ?? false,
    matchedCount: payload.matchedCount ?? 0,
  };
}
