import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { APP_SESSION_COOKIE, verifySessionToken } from "@/lib/app-session";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

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

type LogisticsProviderRow = {
  username: string | null;
  password: string | null;
};

const LOG_SCOPE = "tangchao-auth";
const DEFAULT_TANGCHAO_BASE_URL = "https://wl.tclogx.com";
const TANGCHAO_PROVIDER_NAME = "唐朝";
const TANGCHAO_LOGIN_PATH = "/client/v3/userLogin/login";

async function verifyShipmentTrackOperator() {
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

  if (!permissions.includes("shipment_tracks")) {
    throw new Error("当前账号没有货件轨迹权限");
  }
}

function getOptionalText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function getRequiredText(value: unknown, message: string) {
  const text = getOptionalText(value);

  if (!text) {
    throw new Error(message);
  }

  return text;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  return value as Record<string, unknown>;
}

function getPayloadError(payload: unknown): string {
  const record = toRecord(payload);
  if (!record) return "";

  for (const key of ["message", "msg", "error", "errMsg"]) {
    const text = getOptionalText(record[key]);
    if (text) return text;
  }

  for (const key of ["data", "result"]) {
    const value = record[key];
    const directText = getOptionalText(value);
    if (directText) return directText;

    const nestedError = getPayloadError(value);
    if (nestedError) return nestedError;
  }

  return "";
}

function getPayloadCode(payload: unknown) {
  const record = toRecord(payload);
  if (!record) return null;

  for (const key of ["code", "status", "statusCode"]) {
    const code = record[key];
    if (typeof code === "number" && Number.isFinite(code)) return code;
    if (typeof code === "string" && code.trim()) {
      const parsed = Number(code.trim());
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function isSuccessPayload(payload: unknown, code: number | null) {
  const record = toRecord(payload);

  if (record?.success === false) return false;
  if (record?.success === true) return true;

  return code === null || code === 0 || code === 200;
}

function maskSensitiveText(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return "";
  if (trimmed.length <= 8) return "***";

  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function redactTangchaoLogValue(value: unknown, key = ""): unknown {
  const normalizedKey = key.toLowerCase();
  const isSensitiveKey =
    normalizedKey.includes("token") ||
    normalizedKey.includes("secret") ||
    normalizedKey.includes("password") ||
    normalizedKey.includes("key") ||
    normalizedKey === "authorization" ||
    normalizedKey === "cookie";

  if (typeof value === "string") {
    return isSensitiveKey ? maskSensitiveText(value) : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactTangchaoLogValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([itemKey, itemValue]) => [
        itemKey,
        redactTangchaoLogValue(itemValue, itemKey),
      ]),
    );
  }

  return value;
}

function logTangchaoResponse(label: string, values: Record<string, unknown>) {
  console.log(`[${LOG_SCOPE}] ${label}`, redactTangchaoLogValue(values));
}

function joinTangchaoUrl(baseUrl: string, path: string) {
  return new URL(path, `${baseUrl}/`).toString();
}

function extractAuthKey(payload: unknown) {
  const visit = (value: unknown): string => {
    const record = toRecord(value);
    if (!record) return "";

    for (const [key, field] of Object.entries(record)) {
      if (key.toLowerCase() === "authkey") {
        const text = getOptionalText(field);
        if (text) return text;
      }
    }

    for (const field of Object.values(record)) {
      const text = visit(field);
      if (text) return text;
    }

    return "";
  };

  return visit(payload);
}

async function loginTangchao(params: {
  baseUrl: string;
  username: string;
  password: string;
}) {
  const response = await fetch(
    joinTangchaoUrl(params.baseUrl, TANGCHAO_LOGIN_PATH),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username: params.username,
        password: params.password,
        type: 2,
      }),
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => null);
  const payloadCode = getPayloadCode(payload);
  const authKey = extractAuthKey(payload);

  logTangchaoResponse("login response", {
    status: response.status,
    statusText: response.statusText,
    code: payloadCode,
    payload,
    hasAuthKey: Boolean(authKey),
  });

  if (!response.ok || !isSuccessPayload(payload, payloadCode)) {
    throw new Error(
      getPayloadError(payload) ||
        `唐朝登录失败${payloadCode === null ? "" : `，错误码：${payloadCode}`}`,
    );
  }

  return getRequiredText(authKey, "唐朝登录接口未返回authKey");
}

export async function POST() {
  try {
    await verifyShipmentTrackOperator();

    const adminClient = createSupabaseAdminClient();
    const { data: logisticsData, error: logisticsError } = await adminClient
      .from("logistics_providers")
      .select("username, password")
      .eq("provider_name", TANGCHAO_PROVIDER_NAME)
      .single();

    if (logisticsError) {
      throw logisticsError;
    }

    const logisticsProvider = logisticsData as LogisticsProviderRow;
    const username = getRequiredText(
      logisticsProvider.username,
      "唐朝物流商用户名未配置",
    );
    const password = getRequiredText(
      logisticsProvider.password,
      "唐朝物流商密码未配置",
    );
    const authKey = await loginTangchao({
      baseUrl: DEFAULT_TANGCHAO_BASE_URL,
      username,
      password,
    });

    return NextResponse.json({ authKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : "唐朝登录失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
