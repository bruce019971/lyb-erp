import { readFile } from "node:fs/promises";

function parseEnv(text) {
  const env = {};

  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const index = trimmed.indexOf("=");
    if (index < 0) return;

    env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  });

  return env;
}

function getRequiredEnv(env, key) {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`环境变量 ${key} 未配置`);
  }

  return value;
}

async function requestSupabaseRows({ baseUrl, apiKey, table, params }) {
  const url = new URL(`/rest/v1/${table}`, baseUrl);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `读取 ${table} 失败：HTTP ${response.status} ${JSON.stringify(payload)}`,
    );
  }

  return Array.isArray(payload) ? payload : [];
}

async function upsertShipmentTracks({ baseUrl, apiKey, rows }) {
  if (!rows.length) return [];

  const url = new URL("/rest/v1/shipment_tracks", baseUrl);
  url.searchParams.set("on_conflict", "shipment_record_id");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify(rows),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `写入 shipment_tracks 失败：HTTP ${response.status} ${JSON.stringify(payload)}`,
    );
  }

  return Array.isArray(payload) ? payload : [];
}

async function main() {
  const env = parseEnv(await readFile(".env.local", "utf8"));
  const baseUrl = getRequiredEnv(env, "NEXT_PUBLIC_SUPABASE_URL");
  const apiKey =
    env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    getRequiredEnv(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const pageSize = 1000;
  let page = 0;
  let scannedCount = 0;
  let insertedCount = 0;

  while (true) {
    const from = page * pageSize;
    const shipmentRows = await requestSupabaseRows({
      baseUrl,
      apiKey,
      table: "shipment_records",
      params: {
        select: "id",
        status: "eq.有效",
        order: "created_at.desc.nullslast",
        offset: String(from),
        limit: String(pageSize),
      },
    });

    if (!shipmentRows.length) break;

    scannedCount += shipmentRows.length;

    const upsertedRows = await upsertShipmentTracks({
      baseUrl,
      apiKey,
      rows: shipmentRows
        .map((item) => item.id)
        .filter(Boolean)
        .map((shipmentId) => ({
          shipment_record_id: shipmentId,
        })),
    });

    insertedCount += upsertedRows.length;

    if (shipmentRows.length < pageSize) break;
    page += 1;
  }

  console.log(
    JSON.stringify(
      {
        scannedShipments: scannedCount,
        insertedTracks: insertedCount,
        skippedExistingTracks: scannedCount - insertedCount,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
