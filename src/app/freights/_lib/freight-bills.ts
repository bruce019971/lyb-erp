import type { FreightRecord } from "./freights";
import {
  fetchRishenghuiFreightBill,
  fetchSaleasyFreightBill,
  fetchTangchaoFreightBill,
  fetchTongtuFreightBill,
} from "./freights-request";

export function getBatchBillSkipReason(record: FreightRecord): string | null {
  if (record.freight_paid_status === "是") return "运费已支付";
  if (typeof record.bill_amount === "number" && Number.isFinite(record.bill_amount)) {
    return "账单已存在";
  }
  if (typeof record.total_fee !== "number" || !Number.isFinite(record.total_fee)) {
    return "总费用为空";
  }
  const provider = record.logistics_provider?.trim();
  if (!["日升辉", "通途", "赛易", "唐朝"].includes(provider ?? "")) {
    return "物流商暂不支持生成账单";
  }
  if (provider === "通途") return record.shipment_no?.trim() ? null : "缺少货件号";
  return record.tracking_no?.trim() ? null : "缺少运单编号";
}

export async function fetchFreightBill(record: FreightRecord, accessToken = "") {
  switch (record.logistics_provider?.trim()) {
    case "日升辉":
      if (!accessToken.trim()) throw new Error("请先获取日升辉Token");
      return fetchRishenghuiFreightBill({ freightId: record.id, accessToken: accessToken.trim() });
    case "通途":
      return fetchTongtuFreightBill({ freightId: record.id });
    case "赛易":
      return fetchSaleasyFreightBill({ freightId: record.id });
    case "唐朝":
      return fetchTangchaoFreightBill({ freightId: record.id });
    default:
      throw new Error("当前物流商暂不支持获取账单");
  }
}

export type BatchFreightBillResult = {
  record: FreightRecord;
} & (
  | { status: "success"; billAmount: number; totalFee?: number; isConsistent: boolean }
  | { status: "failed" | "skipped"; message: string }
);

export async function generateFreightBills(
  records: FreightRecord[],
  accessToken = "",
  onProgress?: (completed: number, total: number) => void,
): Promise<BatchFreightBillResult[]> {
  const uniqueRecords = [...new Map(records.map((record) => [record.id, record])).values()];
  const results: BatchFreightBillResult[] = [];
  onProgress?.(0, uniqueRecords.length);
  // 顺序调用，避免同时向同一物流商发起大量账单请求。
  for (const record of uniqueRecords) {
    const skipReason = getBatchBillSkipReason(record);
    if (skipReason) {
      results.push({ record, status: "skipped", message: skipReason });
    } else {
      try {
        const result = await fetchFreightBill(record, accessToken);
        results.push({ record, status: "success", ...result });
      } catch (error) {
        results.push({ record, status: "failed", message: error instanceof Error ? error.message : "账单获取失败" });
      }
    }
    onProgress?.(results.length, uniqueRecords.length);
  }
  return results;
}
