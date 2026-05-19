import { NextResponse } from "next/server";

import {
  RISHENGHUI_VALID_CODE_URL,
  verifyLogisticsOperator,
} from "../_lib";

type ValidCodeResponse = {
  data?: boolean;
  result?: boolean;
  valid?: boolean;
  success?: boolean;
  message?: string;
  msg?: string;
};

function getRequiredText(value: string | null, message: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(message);
  }

  return trimmed;
}

function getValidResult(result: ValidCodeResponse | boolean | null) {
  if (typeof result === "boolean") return result;
  if (!result) return false;
  if (typeof result.data === "boolean") return result.data;
  if (typeof result.result === "boolean") return result.result;
  if (typeof result.valid === "boolean") return result.valid;
  if (typeof result.success === "boolean") return result.success;
  return false;
}

export async function GET(request: Request) {
  try {
    await verifyLogisticsOperator();

    const { searchParams } = new URL(request.url);
    const uuid = getRequiredText(searchParams.get("uuid"), "缺少验证码uuid");
    const code = getRequiredText(searchParams.get("code"), "请输入验证码");
    const params = new URLSearchParams({ uuid, code });
    const response = await fetch(`${RISHENGHUI_VALID_CODE_URL}?${params}`, {
      method: "GET",
      cache: "no-store",
    });
    const result = (await response.json().catch(() => null)) as
      | ValidCodeResponse
      | boolean
      | null;

    if (!response.ok) {
      const message =
        typeof result === "object" && result
          ? result.message || result.msg || "验证码校验失败"
          : "验证码校验失败";
      throw new Error(message);
    }

    return NextResponse.json({
      valid: getValidResult(result),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "验证码校验失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
