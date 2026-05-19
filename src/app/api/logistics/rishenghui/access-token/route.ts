import { NextResponse } from "next/server";

import {
  getRishenghuiCredentials,
  RISHENGHUI_LOGIN_URL,
  verifyLogisticsOperator,
} from "../_lib";

type AccessTokenRequestBody = {
  code?: string;
  uuid?: string;
};

type RishenghuiLoginResponse = {
  accessToken?: string;
  token?: string;
  data?:
    | {
        accessToken?: string;
        token?: string;
      }
    | string
    | null;
  message?: string;
  msg?: string;
};

function getRequiredText(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

function getAccessToken(result: RishenghuiLoginResponse | null) {
  if (!result) return "";
  if (typeof result.accessToken === "string") return result.accessToken.trim();
  if (typeof result.token === "string") return result.token.trim();
  if (typeof result.data === "string") return result.data.trim();
  if (typeof result.data?.accessToken === "string") {
    return result.data.accessToken.trim();
  }
  if (typeof result.data?.token === "string") return result.data.token.trim();
  return "";
}

export async function POST(request: Request) {
  try {
    await verifyLogisticsOperator();

    const body = (await request.json()) as AccessTokenRequestBody;
    const code = getRequiredText(body.code, "请输入日升辉图形验证码");
    const uuid = getRequiredText(body.uuid, "缺少日升辉验证码uuid");
    const credentials = await getRishenghuiCredentials();

    const response = await fetch(RISHENGHUI_LOGIN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username: credentials.username,
        password: credentials.password,
        code,
        uuid,
      }),
    });
    const result = (await response.json().catch(() => null)) as
      | RishenghuiLoginResponse
      | null;

    if (!response.ok) {
      throw new Error(result?.message || result?.msg || "日升辉登录失败");
    }

    const accessToken = getAccessToken(result);
    if (!accessToken) {
      throw new Error(result?.message || result?.msg || "日升辉登录未返回accessToken");
    }

    return NextResponse.json({
      accessToken,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "日升辉accessToken获取失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
