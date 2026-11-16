import { cookies } from "next/headers";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export class ShipmentAccessError extends Error {
  constructor(message: string, public readonly status: 401 | 403) {
    super(message);
  }
}

export async function verifyShipmentOperator() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(APP_SESSION_COOKIE)?.value);
  if (!session) throw new ShipmentAccessError("登录状态已失效，请重新登录", 401);

  const { data, error } = await createSupabaseAdminClient()
    .from("system_users")
    .select("id, status, role:system_roles(menu_permissions)")
    .eq("id", session.userId)
    .single();
  if (error || !data) throw new ShipmentAccessError("当前登录用户未绑定系统账号", 403);
  const operator = data as {
    status: string | null;
    role: { menu_permissions: string[] | null } | { menu_permissions: string[] | null }[] | null;
  };
  const role = Array.isArray(operator.role) ? operator.role[0] : operator.role;
  if (operator.status !== "启用") throw new ShipmentAccessError("当前账号没有启用", 403);
  if (!Array.isArray(role?.menu_permissions) || !role.menu_permissions.includes("shipments")) {
    throw new ShipmentAccessError("当前账号没有货件管理权限", 403);
  }
}
