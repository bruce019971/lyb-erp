export function canAccessStorageRent(
  user?: { roleName?: string | null; menuPermissions?: string[] | null } | null,
) {
  return Boolean(
    user?.menuPermissions?.includes("storage_rent") ||
      user?.roleName === "系统管理员" ||
      user?.roleName === "普通管理员",
  );
}
