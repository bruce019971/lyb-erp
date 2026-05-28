const RISHENGHUI_ACCESS_TOKEN_STORAGE_KEY = "mercado:rishenghui:access-token";

function canUseSessionStorage() {
  return typeof window !== "undefined" && Boolean(window.sessionStorage);
}

export function getStoredRishenghuiAccessToken() {
  if (!canUseSessionStorage()) return "";

  return window.sessionStorage
    .getItem(RISHENGHUI_ACCESS_TOKEN_STORAGE_KEY)
    ?.trim() || "";
}

export function saveStoredRishenghuiAccessToken(accessToken: string) {
  if (!canUseSessionStorage()) return;

  const token = accessToken.trim();
  if (token) {
    window.sessionStorage.setItem(RISHENGHUI_ACCESS_TOKEN_STORAGE_KEY, token);
    return;
  }

  window.sessionStorage.removeItem(RISHENGHUI_ACCESS_TOKEN_STORAGE_KEY);
}

export function clearStoredRishenghuiAccessToken() {
  if (!canUseSessionStorage()) return;

  window.sessionStorage.removeItem(RISHENGHUI_ACCESS_TOKEN_STORAGE_KEY);
}
