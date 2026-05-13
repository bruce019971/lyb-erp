export type ProductRecord = {
  id: string;
  product_name: string | null;
  product_url: string | null;
  product_id: string | null;
  sku: string | null;
  ml_code: string | null;
  store_name: string | null;
  store_url?: string | null;
  product_image_url: string | null;
  product_parameters: string | null;
  packing_list: string | null;
  color_box_size: string | null;
  single_gross_weight: number | null;
  carton_spec: string | null;
  pcs_per_carton: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ProductCreateValues = {
  product_name: string;
  product_url?: string | null;
  product_id?: string | null;
  sku?: string | null;
  ml_code?: string | null;
  store_name?: string | null;
  product_image_url?: string | null;
  product_parameters?: string | null;
  packing_list?: string | null;
  color_box_size?: string | null;
  single_gross_weight?: number | null;
  carton_spec?: string | null;
  pcs_per_carton?: number | null;
};

export type ProductUpdateValues = ProductCreateValues;

export const productKeywordFields = [
  "product_name",
  "product_url",
  "product_id",
  "sku",
  "ml_code",
  "store_name",
  "product_parameters",
  "packing_list",
  "carton_spec",
] as const satisfies ReadonlyArray<keyof ProductRecord>;
