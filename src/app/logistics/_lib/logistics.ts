export type LogisticsProviderRecord = {
  id: string;
  provider_name: string | null;
  system_url: string | null;
  username: string | null;
  password: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type LogisticsProviderCreateValues = {
  provider_name: string;
  system_url?: string | null;
  username?: string | null;
  password?: string | null;
};

export type LogisticsProviderUpdateValues = LogisticsProviderCreateValues;

export type LogisticsProviderOption = {
  id: string;
  provider_name: string | null;
  system_url: string | null;
};

export const logisticsKeywordFields = [
  "provider_name",
  "system_url",
] as const satisfies ReadonlyArray<keyof LogisticsProviderRecord>;
