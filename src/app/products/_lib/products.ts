export type ProductRecord = {
  id: string;
  product_name: string | null;
  product_url: string | null;
  product_id: string | null;
  sku: string | null;
  ml_code: string | null;
  store_name: string | null;
  store_code?: string | null;
  store_url?: string | null;
  product_image_url: string | null;
  product_label_url: string | null;
  product_parameters: string | null;
  packing_list: string | null;
  color_box_size: string | null;
  single_gross_weight: number | null;
  product_unit_price: number | null;
  carton_spec: string | null;
  pcs_per_carton: number | null;
  customs_code: string | null;
  product_category: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ProductShipmentOption = {
  id: string;
  product_name: string | null;
  store_name: string | null;
  pcs_per_carton: number | null;
  product_unit_price: number | null;
};

export type ProductFilterOption = {
  label: string;
  value: string;
};

export type ProductFilterOptions = {
  productNameOptions: ProductFilterOption[];
  skuOptions: ProductFilterOption[];
  storeNameOptions: ProductFilterOption[];
};

export type ProductCreateValues = {
  product_name: string;
  product_url?: string | null;
  product_id?: string | null;
  sku?: string | null;
  ml_code?: string | null;
  store_name?: string | null;
  product_image_url?: string | null;
  product_label_url?: string | null;
  product_parameters?: string | null;
  packing_list?: string | null;
  color_box_size?: string | null;
  single_gross_weight?: number | null;
  product_unit_price?: number | null;
  carton_spec?: string | null;
  pcs_per_carton?: number | null;
  customs_code?: string | null;
  product_category?: string | null;
};

export type ProductUpdateValues = ProductCreateValues;

export const productKeywordFields = [
  "product_name",
  "sku",
  "store_name",
] as const satisfies ReadonlyArray<keyof ProductRecord>;
