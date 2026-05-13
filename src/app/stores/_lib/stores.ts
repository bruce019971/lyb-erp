export type StoreRecord = {
  id: string;
  seller_id: string | null;
  seller_name: string | null;
  seller_address: string | null;
  seller_type: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type StoreCreateValues = {
  seller_id: string;
  seller_name: string;
  seller_address?: string | null;
  seller_type?: string | null;
};

export type StoreUpdateValues = StoreCreateValues;

export type StoreOption = {
  id: string;
  seller_name: string;
};

export const storeKeywordFields = [
  "seller_id",
  "seller_name",
  "seller_address",
  "seller_type",
] as const satisfies ReadonlyArray<keyof StoreRecord>;
