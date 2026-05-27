export type LogisticsProviderRecord = {
  id: string;
  provider_name: string | null;
  system_url: string | null;
  username: string | null;
  password: string | null;
  invoice_template_url: string | null;
  general_freight_unit_price: number | null;
  textile_freight_unit_price: number | null;
  product_label_unit_price: number | null;
  carton_label_unit_price: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type LogisticsProviderCreateValues = {
  provider_name: string;
  system_url?: string | null;
  username?: string | null;
  password?: string | null;
  invoice_template_url?: string | null;
  general_freight_unit_price?: number | null;
  textile_freight_unit_price?: number | null;
  product_label_unit_price?: number | null;
  carton_label_unit_price?: number | null;
};

export type LogisticsProviderUpdateValues = LogisticsProviderCreateValues;

export type LogisticsProviderOption = {
  id: string;
  provider_name: string | null;
  system_url: string | null;
  username?: string | null;
  password?: string | null;
  invoice_template_url?: string | null;
  general_freight_unit_price?: number | null;
  textile_freight_unit_price?: number | null;
  product_label_unit_price?: number | null;
  carton_label_unit_price?: number | null;
};

export const logisticsKeywordFields = [
  "provider_name",
  "system_url",
] as const satisfies ReadonlyArray<keyof LogisticsProviderRecord>;
