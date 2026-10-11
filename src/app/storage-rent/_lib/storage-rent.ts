export type StorageRentShipment = {
  id: string;
  shipment_no: string | null;
  product_name: string | null;
  box_count: number | null;
  overseas_warehouse_arrived_at: string | null;
  appointment_time: string | null;
  delivery_status: string | null;
  status: string | null;
};

export type StorageRentRecord = StorageRentShipment & {
  overdue_days: number;
  storage_fee: number | null;
};

export type StorageRentResult = {
  data: StorageRentRecord[];
  total: number;
  total_fee: number;
  missing_box_count: number;
};

const MILLISECONDS_PER_DAY = 86_400_000;
const FREE_STORAGE_DAYS = 30;
const DAILY_RENT_CENTS = 80;

function parseDateDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return date.getTime() / MILLISECONDS_PER_DAY;
}

export function calculateStorageRent(
  shipment: StorageRentShipment,
): StorageRentRecord | null {
  if (shipment.status !== "有效" || shipment.delivery_status !== "是") return null;
  const arrivedDay = parseDateDay(shipment.overseas_warehouse_arrived_at);
  const deliveryDay = parseDateDay(shipment.appointment_time);
  if (arrivedDay === null || deliveryDay === null) return null;

  // 到仓当天和送仓当天均计入仓储天数，第31天开始收费。
  const overdueDays = deliveryDay - arrivedDay + 1 - FREE_STORAGE_DAYS;
  if (overdueDays <= 0) return null;

  const boxCount = shipment.box_count;
  const validBoxCount = typeof boxCount === "number" &&
    Number.isInteger(boxCount) && boxCount > 0;

  return {
    ...shipment,
    overdue_days: overdueDays,
    storage_fee: validBoxCount
      ? (DAILY_RENT_CENTS * boxCount * overdueDays) / 100
      : null,
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
    missing_box_count: data.filter((record) => record.storage_fee === null).length,
  };
}

export function splitShipmentSearchValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.flatMap((item) =>
    typeof item === "string" ? item.split(/[\s,，]+/).filter(Boolean) : [],
  ))];
}
