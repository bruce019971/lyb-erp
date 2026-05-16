export const AUTH_STORAGE_KEY = "mercado-inbound-planning:auth-session";

export type AuthSession = {
  userId: string;
  username: string;
  nickname: string;
  roleId: string | null;
  roleName: string | null;
  menuPermissions: string[];
  loginAt: string;
};

export function getStoredAuthSession() {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.userId || !parsed?.username) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setStoredAuthSession(session: AuthSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredAuthSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}
