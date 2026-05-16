import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

type SessionPayload = {
  userId: string;
  username: string;
  exp: number;
};

export const APP_SESSION_COOKIE = "mercado_inbound_session";
export const APP_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function getSessionSecret() {
  const secret = process.env.APP_AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("环境变量 APP_AUTH_SECRET 未配置");
  }
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

export function createSessionToken(payload: Omit<SessionPayload, "exp">) {
  const sessionPayload: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + APP_SESSION_MAX_AGE,
  };

  const encodedPayload = Buffer.from(JSON.stringify(sessionPayload)).toString(
    "base64url",
  );

  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifySessionToken(token: string | undefined | null) {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  const signatureMatches =
    expectedSignature.length === signature.length &&
    timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));

  if (!signatureMatches) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as SessionPayload;

    if (
      !payload?.userId ||
      !payload?.username ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
