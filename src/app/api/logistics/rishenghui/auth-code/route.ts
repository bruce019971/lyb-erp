import { NextResponse } from "next/server";

import {
  RISHENGHUI_AUTH_CODE_URL,
  verifyLogisticsOperator,
} from "../_lib";

type RishenghuiAuthCodeResponse = {
  img?: string;
  uuid?: string;
};

export async function GET() {
  try {
    await verifyLogisticsOperator();

    const response = await fetch(RISHENGHUI_AUTH_CODE_URL, {
      method: "GET",
      cache: "no-store",
    });

    const result = (await response.json().catch(() => null)) as
      | RishenghuiAuthCodeResponse
      | null;

    if (!response.ok) {
      throw new Error("日升辉验证码获取失败");
    }

    if (!result?.img || !result.uuid) {
      throw new Error("日升辉验证码返回格式异常");
    }

    return NextResponse.json({
      img: result.img,
      uuid: result.uuid,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "日升辉验证码获取失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
