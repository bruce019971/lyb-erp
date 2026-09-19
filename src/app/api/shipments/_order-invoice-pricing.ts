export function getOrderInvoiceUnitPrice(productUnitPrice?: number | null) {
  if (typeof productUnitPrice !== "number" || !Number.isFinite(productUnitPrice)) {
    return null;
  }

  return productUnitPrice / 4;
}

export function getOrderInvoiceTotalAmount(
  quantity?: number | null,
  productUnitPrice?: number | null,
) {
  const unitPrice = getOrderInvoiceUnitPrice(productUnitPrice);
  if (
    typeof quantity !== "number" ||
    !Number.isFinite(quantity) ||
    unitPrice === null
  ) {
    return null;
  }

  return Math.round(quantity * unitPrice * 100) / 100;
}
