export type RelabelFeeContext = {
  duration_days: number | null;
  carton_label_unit_price: number | null;
};

type RelabelFeeValues = {
  relabel_fee?: number | null;
  relabel_type?: string | null;
  box_count?: number | null;
};

// 保留原始费用，按轨迹时效计算应付费用，避免编辑或刷新时重复扣减。
export function calculatePayableRelabelFee(
  record: RelabelFeeValues,
  context?: RelabelFeeContext,
): number | null {
  const fee = record.relabel_fee;
  if (typeof fee !== "number" || !Number.isFinite(fee)) return null;
  const duration = context?.duration_days;
  const type = record.relabel_type?.trim();
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 50 ||
    (type !== "外箱标" && type !== "外箱标及产品标")) return fee;
  if (type === "外箱标") return 0;

  const count = record.box_count;
  const price = context?.carton_label_unit_price;
  if (typeof count !== "number" || !Number.isFinite(count) || count < 0 ||
    typeof price !== "number" || !Number.isFinite(price) || price < 0) return null;

  return Math.max(0, Math.round(fee * 100) - Math.round(count * price * 100)) / 100;
}
