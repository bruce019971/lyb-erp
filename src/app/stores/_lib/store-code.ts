import { pinyin } from "pinyin-pro";

export function generateStoreCode(storeName?: string | null) {
  const trimmed = storeName?.trim();
  if (!trimmed) return "";

  const initials = pinyin(trimmed, {
    pattern: "first",
    toneType: "none",
    type: "string",
  });

  return initials.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function buildStoreUrl(sellerId?: string | null) {
  const trimmed = sellerId?.trim();
  if (!trimmed) return null;

  return `https://listado.mercadolibre.com.mx/_CustId_${trimmed}`;
}
