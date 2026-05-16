import type { CurrentUserProfile } from "./profile";

type ApiResponse<T> = {
  data?: T;
  error?: string;
};

export async function requestCurrentUserProfile() {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiResponse<CurrentUserProfile>
    | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error || "个人信息读取失败");
  }

  return payload.data;
}

export async function updateCurrentUserPassword(
  currentPassword: string,
  nextPassword: string,
) {
  const response = await fetch("/api/auth/password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      currentPassword,
      nextPassword,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiResponse<boolean>
    | null;

  if (!response.ok) {
    throw new Error(payload?.error || "密码修改失败");
  }

  return payload?.data ?? true;
}
