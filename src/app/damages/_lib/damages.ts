export type DamageRecord = {
  id: string;
  shipment_record_id: string | null;
  delivery_shipment_no: string;
  tracking_no: string | null;
  product_name: string;
  delivery_store: string;
  delivery_date: string;
  product_count: number;
  damage_count: number;
  freight_unit_price: number;
  product_unit_price: number;
  product_value: number;
  freight_value: number;
  total_value: number;
  created_at: string | null;
  updated_at: string | null;
};

export type DamageCreateValues = {
  shipment_record_id: string;
  delivery_shipment_no: string;
  product_name: string;
  delivery_store: string;
  delivery_date: string;
  product_count: number;
  damage_count: number;
  freight_unit_price: number;
  product_unit_price: number;
};

export type DamageShipmentOption = {
  shipment_record_id: string;
  delivery_shipment_no: string;
  product_name: string | null;
  delivery_store: string | null;
  delivery_date: string | null;
  product_count: number | null;
  freight_unit_price: number | null;
  product_unit_price: number | null;
};

export function formatDamageDate(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

export function calculateDamageValues({
  damageCount,
  freightUnitPrice,
  productUnitPrice,
}: {
  damageCount?: number | null;
  freightUnitPrice?: number | null;
  productUnitPrice?: number | null;
}) {
  const normalizedDamageCount =
    typeof damageCount === "number" && Number.isFinite(damageCount)
      ? damageCount
      : 0;
  const normalizedFreightUnitPrice =
    typeof freightUnitPrice === "number" && Number.isFinite(freightUnitPrice)
      ? freightUnitPrice
      : 0;
  const normalizedProductUnitPrice =
    typeof productUnitPrice === "number" && Number.isFinite(productUnitPrice)
      ? productUnitPrice
      : 0;
  const productValue = Number(
    (normalizedDamageCount * normalizedProductUnitPrice).toFixed(2),
  );
  const freightValue = Number(
    (normalizedDamageCount * normalizedFreightUnitPrice).toFixed(2),
  );

  return {
    productValue,
    freightValue,
    totalValue: Number((productValue + freightValue).toFixed(2)),
  };
}
