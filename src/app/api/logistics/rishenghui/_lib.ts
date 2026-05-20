import { cookies } from "next/headers";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const RISHENGHUI_API_BASE = "http://120.77.87.18:8005";
export const RISHENGHUI_AUTH_CODE_URL = `${RISHENGHUI_API_BASE}/cms/user/auth-code`;
export const RISHENGHUI_VALID_CODE_URL = `${RISHENGHUI_API_BASE}/cms/user/valid-code`;
export const RISHENGHUI_LOGIN_URL = `${RISHENGHUI_API_BASE}/cms/user/login`;
export const RISHENGHUI_PRINT_MAITOU_URL = `${RISHENGHUI_API_BASE}/cms/order/print-maitou`;
export const RISHENGHUI_FILE_UPLOAD_URL = `${RISHENGHUI_API_BASE}/cms/file/upload`;
export const RISHENGHUI_COMMON_IMPORT_URL = `${RISHENGHUI_API_BASE}/cms/common/import`;
export const RISHENGHUI_TPL_LIST_VALUES_URL = `${RISHENGHUI_API_BASE}/cms/tpl/list/values`;

type OperatorRow = {
  id: string;
  status: "启用" | "停用" | null;
  role:
    | {
        menu_permissions: string[] | null;
      }
    | Array<{
        menu_permissions: string[] | null;
      }>
    | null;
};

type LogisticsProviderCredentials = {
  username: string | null;
  password: string | null;
};

export async function verifyLogisticsOperator() {
  const cookieStore = await cookies();
  const token = cookieStore.get(APP_SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);

  if (!session) {
    throw new Error("登录状态已失效，请重新登录");
  }

  const adminClient = createSupabaseAdminClient();
  const { data, error } = await adminClient
    .from("system_users")
    .select("id, status, role:system_roles(menu_permissions)")
    .eq("id", session.userId)
    .single();

  if (error) {
    throw new Error("当前登录用户未绑定系统账号");
  }

  const operator = data as OperatorRow;
  const roleData = Array.isArray(operator.role) ? operator.role[0] : operator.role;
  const permissions = Array.isArray(roleData?.menu_permissions)
    ? roleData.menu_permissions
    : [];

  if (operator.status !== "启用") {
    throw new Error("当前登录用户已停用");
  }

  if (!permissions.includes("logistics")) {
    throw new Error("当前账号没有物流管理权限");
  }
}

export async function getRishenghuiCredentials() {
  const adminClient = createSupabaseAdminClient();
  const { data, error } = await adminClient
    .from("logistics_providers")
    .select("username, password")
    .eq("provider_name", "日升辉")
    .single();

  if (error) {
    throw new Error("未找到日升辉物流商配置");
  }

  const credentials = data as LogisticsProviderCredentials;
  const username = credentials.username?.trim();
  const password = credentials.password?.trim();

  if (!username || !password) {
    throw new Error("日升辉物流商用户名或密码未配置");
  }

  return {
    username,
    password,
  };
}
