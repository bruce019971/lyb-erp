import { RISHENGHUI_TPL_LIST_VALUES_URL } from "../logistics/rishenghui/_lib";

type RishenghuiDimensionRow = Record<string, unknown>;

type RishenghuiDimensionPayload =
  | RishenghuiDimensionRow[]
  | {
      data?:
        | RishenghuiDimensionRow[]
        | {
            records?: RishenghuiDimensionRow[];
            rows?: RishenghuiDimensionRow[];
            list?: RishenghuiDimensionRow[];
          };
      result?: RishenghuiDimensionRow[];
      rows?: RishenghuiDimensionRow[];
      list?: RishenghuiDimensionRow[];
      records?: RishenghuiDimensionRow[];
      message?: unknown;
      msg?: unknown;
      error?: unknown;
    }
  | null;

type DimensionBox = {
  row: RishenghuiDimensionRow;
  packno: string;
  width: number | null;
  length: number | null;
  height: number | null;
  yjf_weit: number | null;
};

const RISHENGHUI_BOX_VOLUME_PAYLOAD = {
  pagesize: 0,
  pageno: 0,
  reportno: "ODRVOL",
  opentype: "find",
  colen: "find",
  userquery1: "%",
} as const;
const RISHENGHUI_BILL_AMOUNT_PAYLOAD = {
  pagesize: 0,
  pageno: 0,
  reportno: "FYQR",
  opentype: "find",
  colen: "find",
} as const;
const RISHENGHUI_BILL_DETAIL_PAYLOAD = {
  pagesize: 0,
  pageno: 0,
  reportno: "FYQRMX",
  opentype: "find",
  colen: "find",
} as const;

function getPayloadError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";

  const result = payload as {
    message?: unknown;
    msg?: unknown;
    error?: unknown;
  };

  if (typeof result.message === "string" && result.message.trim()) {
    return result.message.trim();
  }

  if (typeof result.msg === "string" && result.msg.trim()) {
    return result.msg.trim();
  }

  if (typeof result.error === "string" && result.error.trim()) {
    return result.error.trim();
  }

  return "";
}

function getPayloadSummary(payload: unknown) {
  const text = JSON.stringify(payload);
  return text.length > 800 ? `${text.slice(0, 800)}...` : text;
}

function getRows(payload: RishenghuiDimensionPayload): RishenghuiDimensionRow[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is RishenghuiDimensionRow =>
        Boolean(item) && typeof item === "object",
    );
  }

  if (!payload || typeof payload !== "object") return [];

  const candidateLists = [
    payload.data,
    payload.result,
    payload.rows,
    payload.list,
    payload.records,
  ];

  for (const candidate of candidateLists) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (item): item is RishenghuiDimensionRow =>
          Boolean(item) && typeof item === "object",
      );
    }

    if (candidate && typeof candidate === "object") {
      const nested = candidate as {
        records?: RishenghuiDimensionRow[];
        rows?: RishenghuiDimensionRow[];
        list?: RishenghuiDimensionRow[];
      };
      for (const nestedCandidate of [
        nested.records,
        nested.rows,
        nested.list,
      ]) {
        if (Array.isArray(nestedCandidate)) {
          return nestedCandidate.filter(
            (item): item is RishenghuiDimensionRow =>
              Boolean(item) && typeof item === "object",
          );
        }
      }
    }
  }

  return [];
}

function normalizeKey(key: string) {
  return key.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "").toLowerCase();
}

function getNumberField(
  row: RishenghuiDimensionRow,
  fieldNames: readonly string[],
) {
  const normalizedFieldNames = fieldNames.map(normalizeKey);

  for (const [key, value] of Object.entries(row)) {
    if (!normalizedFieldNames.includes(normalizeKey(key))) continue;

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.trim().replace(/,/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function getTextField(
  row: RishenghuiDimensionRow,
  fieldNames: readonly string[],
) {
  const normalizedFieldNames = fieldNames.map(normalizeKey);

  for (const [key, value] of Object.entries(row)) {
    if (!normalizedFieldNames.includes(normalizeKey(key))) continue;

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function round(value: number, precision: number) {
  const ratio = 10 ** precision;
  return Math.round(value * ratio) / ratio;
}

function getPackNo(row: RishenghuiDimensionRow) {
  return getTextField(row, ["packno", "pack_no", "运单编号", "运单号"]);
}

function normalizeBox(row: RishenghuiDimensionRow): DimensionBox {
  const singleBoxVolume = getNumberField(row, ["yjf_weit"]);

  return {
    row,
    packno: getPackNo(row),
    width: getNumberField(row, ["width", "宽"]),
    length: getNumberField(row, ["length", "长"]),
    height: getNumberField(row, ["height", "高"]),
    yjf_weit: singleBoxVolume === null ? null : round(singleBoxVolume, 6),
  };
}

function getTotalVolume(boxes: DimensionBox[]) {
  const volumes = boxes
    .map((item) => item.yjf_weit)
    .filter((item): item is number => typeof item === "number");

  if (!volumes.length) return null;

  return round(
    volumes.reduce((total, item) => total + item, 0),
    3,
  );
}

export async function syncRishenghuiBoxDimensions(params: {
  accessToken: string;
  trackingNo: string;
}) {
  const trackingNo = params.trackingNo.trim();
  if (!trackingNo) {
    return {
      rows: [],
      matchedRows: [],
      boxes: [],
      totalVolume: null,
      payload: null,
    };
  }

  const response = await fetch(RISHENGHUI_TPL_LIST_VALUES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(RISHENGHUI_BOX_VOLUME_PAYLOAD),
  });
  const result = (await response.json().catch(() => null)) as
    | RishenghuiDimensionPayload
    | null;

  console.log("[rishenghui-box-dimensions] values response", {
    request: {
      reportno: RISHENGHUI_BOX_VOLUME_PAYLOAD.reportno,
      trackingNo,
    },
    status: response.status,
    result: getPayloadSummary(result),
  });

  if (!response.ok) {
    throw new Error(getPayloadError(result) || "日升辉尺寸明细查询失败");
  }

  const rows = getRows(result);
  const matchedRows = rows.filter((row) => getPackNo(row) === trackingNo);
  const boxes = matchedRows.map(normalizeBox);
  const totalVolume = getTotalVolume(boxes);

  if (!rows.length) {
    console.log("[rishenghui-box-dimensions] empty result", {
      request: RISHENGHUI_BOX_VOLUME_PAYLOAD,
      response: getPayloadSummary(result),
    });
  }

  return {
    rows,
    matchedRows,
    boxes,
    totalVolume,
    payload: result,
  };
}

export async function fetchRishenghuiBillAmount(params: {
  accessToken: string;
  trackingNo: string;
}) {
  const trackingNo = params.trackingNo.trim();
  if (!trackingNo) {
    return {
      rows: [],
      matchedRows: [],
      billAmount: null,
      row: null,
      payload: null,
    };
  }

  const response = await fetch(RISHENGHUI_TPL_LIST_VALUES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(RISHENGHUI_BILL_AMOUNT_PAYLOAD),
  });
  const result = (await response.json().catch(() => null)) as
    | RishenghuiDimensionPayload
    | null;

  console.log("[rishenghui-bill-amount] values response", {
    request: {
      reportno: RISHENGHUI_BILL_AMOUNT_PAYLOAD.reportno,
      trackingNo,
    },
    status: response.status,
    result: getPayloadSummary(result),
  });

  if (!response.ok) {
    throw new Error(getPayloadError(result) || "日升辉账单金额查询失败");
  }

  const rows = getRows(result);
  const matchedRows = rows.filter((row) => getPackNo(row) === trackingNo);
  const row = matchedRows[0] ?? null;
  const billAmount = row ? getNumberField(row, ["zamt", "账单金额"]) : null;

  if (!rows.length || !matchedRows.length) {
    console.log("[rishenghui-bill-amount] empty matched result", {
      request: RISHENGHUI_BILL_AMOUNT_PAYLOAD,
      trackingNo,
      response: getPayloadSummary(result),
    });
  }

  return {
    rows,
    matchedRows,
    billAmount,
    row,
    payload: result,
  };
}

export async function fetchRishenghuiFreightUnitPrice(params: {
  accessToken: string;
  trackingNo: string;
}) {
  const trackingNo = params.trackingNo.trim();
  if (!trackingNo) {
    return {
      rows: [],
      matchedRows: [],
      detailRows: [],
      billCode: "",
      unitPrice: null,
      billRow: null,
      detailRow: null,
      payload: null,
      detailPayload: null,
    };
  }

  const billResponse = await fetch(RISHENGHUI_TPL_LIST_VALUES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(RISHENGHUI_BILL_AMOUNT_PAYLOAD),
  });
  const billResult = (await billResponse.json().catch(() => null)) as
    | RishenghuiDimensionPayload
    | null;

  console.log("[rishenghui-freight-unit-price] bill response", {
    request: {
      reportno: RISHENGHUI_BILL_AMOUNT_PAYLOAD.reportno,
      trackingNo,
    },
    status: billResponse.status,
    result: getPayloadSummary(billResult),
  });

  if (!billResponse.ok) {
    throw new Error(getPayloadError(billResult) || "日升辉账单查询失败");
  }

  const rows = getRows(billResult);
  const matchedRows = rows.filter((row) => getPackNo(row) === trackingNo);
  const billRow = matchedRows[0] ?? null;
  const billCode = billRow
    ? getTextField(billRow, ["billcode", "账单id", "账单ID", "账单编号"])
    : "";

  if (!billCode) {
    console.log("[rishenghui-freight-unit-price] empty bill code", {
      request: RISHENGHUI_BILL_AMOUNT_PAYLOAD,
      trackingNo,
      response: getPayloadSummary(billResult),
    });

    return {
      rows,
      matchedRows,
      detailRows: [],
      billCode: "",
      unitPrice: null,
      billRow,
      detailRow: null,
      payload: billResult,
      detailPayload: null,
    };
  }

  const detailPayload = {
    ...RISHENGHUI_BILL_DETAIL_PAYLOAD,
    userquery1: billCode,
  };
  const detailResponse = await fetch(RISHENGHUI_TPL_LIST_VALUES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(detailPayload),
  });
  const detailResult = (await detailResponse.json().catch(() => null)) as
    | RishenghuiDimensionPayload
    | null;

  console.log("[rishenghui-freight-unit-price] detail response", {
    request: {
      reportno: detailPayload.reportno,
      trackingNo,
      billCode,
    },
    status: detailResponse.status,
    result: getPayloadSummary(detailResult),
  });

  if (!detailResponse.ok) {
    throw new Error(getPayloadError(detailResult) || "日升辉账单明细查询失败");
  }

  const detailRows = getRows(detailResult);
  const detailRow = detailRows[0] ?? null;
  const unitPrice = detailRow
    ? getNumberField(detailRow, ["zprice", "运费单价", "单价"])
    : null;

  if (!detailRows.length) {
    console.log("[rishenghui-freight-unit-price] empty detail result", {
      request: detailPayload,
      trackingNo,
      billCode,
      response: getPayloadSummary(detailResult),
    });
  }

  return {
    rows,
    matchedRows,
    detailRows,
    billCode,
    unitPrice,
    billRow,
    detailRow,
    payload: billResult,
    detailPayload: detailResult,
  };
}
