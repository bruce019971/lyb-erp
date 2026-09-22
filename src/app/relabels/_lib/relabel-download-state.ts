import { getStoredAuthSession } from "@/lib/auth";

const STORAGE_PREFIX = "lyb-erp:relabels:pending-download:";
export const RELABEL_DOWNLOAD_CHANGED = "relabel-download-changed";
const fallbackIds = new Map<string, string[]>();
const failedStorageKeys = new Set<string>();

function getStorageKey() {
  if (typeof window === "undefined") return null;
  try {
    const userId = getStoredAuthSession()?.userId;
    return userId ? `${STORAGE_PREFIX}${userId}` : null;
  } catch {
    return null;
  }
}

export function getPendingRelabelDownloadIds(): string[] {
  const key = getStorageKey();
  if (!key) return [];
  if (failedStorageKeys.has(key)) return fallbackIds.get(key) ?? [];

  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string" && Boolean(id))
      : [];
  } catch {
    return fallbackIds.get(key) ?? [];
  }
}

function savePendingIds(ids: string[]) {
  const key = getStorageKey();
  if (!key) return;
  fallbackIds.set(key, ids);
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
    failedStorageKeys.delete(key);
  } catch {
    failedStorageKeys.add(key);
    // A browser storage error must not turn a successful create/download into a failure.
  }
}

export function trackNewRelabelDownload(id: string) {
  savePendingIds(Array.from(new Set([...getPendingRelabelDownloadIds(), id])));
}

export function completeRelabelDownload(id: string) {
  const ids = getPendingRelabelDownloadIds();
  if (!ids.includes(id)) return;
  savePendingIds(ids.filter((item) => item !== id));
  window.dispatchEvent(new Event(RELABEL_DOWNLOAD_CHANGED));
}

export function isRelabelDownloadStorageKey(key: string | null) {
  return key === null || key === getStorageKey();
}
