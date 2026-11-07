export type StorageRentShipment = {
  id: string;
  shipment_no: string | null;
  product_name: string | null;
  box_count: number | null;
  overseas_warehouse_arrived_at: string | null;
  appointment_time: string | null;
  delivery_status: string | null;
  status: string | null;
  storage_rent_paid_status: "是" | "否";
};

export type StorageRentRecord = StorageRentShipment & {
  overdue_days: number | null;
  storage_fee: number | null;
  calculation_note: string | null;
};

export type StorageRentResult = {
  data: StorageRentRecord[];
  total: number;
  total_fee: number;
  uncalculated_count: number;
};

export type StorageRentFilterOptions = {
  shipmentNos: string[];
  productNames: string[];
};

const MILLISECONDS_PER_DAY = 86_400_000;
const FREE_STORAGE_DAYS = 30;
const DAILY_RENT_CENTS = 80;
const SECOND_TIER_DAILY_RENT_CENTS = 100;

function normalizeStorageDate(value: string | null) {
  const text = value?.trim();
  if (!text || !/^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(text)) return null;
  // 与货件管理显示一致，保留记录中的日历日期，不按浏览器时区换算。
  const datePart = text.slice(0, 10);
  const date = new Date(`${datePart}T00:00:00.000Z`);
  if (!Number.isFinite(Date.parse(text)) ||
    !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== datePart) {
    return null;
  }
  return datePart;
}

export function calculateStorageRent(
  shipment: StorageRentShipment,
): StorageRentRecord | null {
  if (shipment.status !== "有效" || !shipment.appointment_time?.trim()) return null;
  const arrivedDate = normalizeStorageDate(shipment.overseas_warehouse_arrived_at);
  const deliveryDate = normalizeStorageDate(shipment.appointment_time);
  const record: StorageRentRecord = {
    ...shipment,
    overseas_warehouse_arrived_at: arrivedDate,
    appointment_time: deliveryDate,
    overdue_days: null,
    storage_fee: null,
    calculation_note: null,
  };
  if (deliveryDate === null) return { ...record, calculation_note: "送仓日期无效，无法计算仓租" };
  if (arrivedDate === null) return { ...record, calculation_note: "到仓日期缺失或无效，无法计算仓租" };
  const arrivedDay = Date.parse(`${arrivedDate}T00:00:00.000Z`) / MILLISECONDS_PER_DAY;
  const deliveryDay = Date.parse(`${deliveryDate}T00:00:00.000Z`) / MILLISECONDS_PER_DAY;
  if (deliveryDay < arrivedDay) return { ...record, calculation_note: "送仓日期早于到仓日期，无法计算仓租" };

  // 仓储天数按送仓日期与到仓日期的日历差计算，前30天免租。
  const overdueDays = Math.max(deliveryDay - arrivedDay - FREE_STORAGE_DAYS, 0);

  const boxCount = shipment.box_count;
  const validBoxCount = typeof boxCount === "number" &&
    Number.isInteger(boxCount) && boxCount > 0;
  const firstTierDays = Math.min(overdueDays, 30);
  const secondTierDays = Math.min(Math.max(overdueDays - 30, 0), 30);
  const remainingDays = Math.max(overdueDays - 60, 0);
  const rentPerBoxCents = firstTierDays * DAILY_RENT_CENTS +
    secondTierDays * SECOND_TIER_DAILY_RENT_CENTS +
    remainingDays * DAILY_RENT_CENTS;

  return {
    ...record,
    overdue_days: overdueDays,
    storage_fee: overdueDays === 0 ? 0 : validBoxCount
      ? (rentPerBoxCents * boxCount) / 100
      : null,
    calculation_note: overdueDays > 0 && !validBoxCount ? "缺少有效箱数，无法计算仓租" : null,
  };
}

export function summarizeStorageRent(data: StorageRentRecord[]): StorageRentResult {
  const cents = data.reduce(
    (sum, record) => sum + Math.round((record.storage_fee ?? 0) * 100),
    0,
  );
  return {
    data,
    total: data.length,
    total_fee: cents / 100,
    uncalculated_count: data.filter((record) => record.storage_fee === null).length,
  };
}

export function splitShipmentSearchValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.flatMap((item) =>
    typeof item === "string" ? item.split(/[\s,，]+/).filter(Boolean) : [],
  ))];
}

export function normalizeProductSearchValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map((item) =>
    typeof item === "string" ? item.trim() : "",
  ).filter(Boolean))];
}

export function buildStorageRentFilterOptions(
  shipments: Pick<StorageRentShipment, "shipment_no" | "product_name">[],
): StorageRentFilterOptions {
  return {
    shipmentNos: normalizeProductSearchValues(shipments.map((row) => row.shipment_no))
      .sort((a, b) => a.localeCompare(b, "zh-CN")),
    productNames: normalizeProductSearchValues(shipments.map((row) => row.product_name))
      .sort((a, b) => a.localeCompare(b, "zh-CN")),
  };
}
