import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile() {
  const envPath = resolve(process.cwd(), ".env.local");
  const content = readFileSync(envPath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    process.env[key] ||= value;
  }
}

function getEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} 未配置`);
  }
  return value;
}

function getSupabaseHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
  };
}

async function fetchSupabaseJson(url, serviceRoleKey, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...getSupabaseHeaders(serviceRoleKey),
      ...(init.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
  }

  return payload;
}

function roundMoney(value) {
  return Number(value.toFixed(2));
}

function calculateFreightTotalFee(record) {
  if (
    record.freight_unit_price === null ||
    record.freight_unit_price === undefined ||
    record.volume === null ||
    record.volume === undefined
  ) {
    return null;
  }

  const freightUnitPrice = Number(record.freight_unit_price);
  const volume = Number(record.volume);
  const extraFee =
    record.extra_fee === null || record.extra_fee === undefined
      ? 0
      : Number(record.extra_fee);

  if (
    !Number.isFinite(freightUnitPrice) ||
    !Number.isFinite(volume) ||
    !Number.isFinite(extraFee)
  ) {
    return null;
  }

  return roundMoney(freightUnitPrice * volume + extraFee);
}

async function verifyTargetColumn(supabaseUrl, serviceRoleKey) {
  const url = new URL("/rest/v1/freight_records", supabaseUrl);
  url.searchParams.set("select", "id,total_fee");
  url.searchParams.set("limit", "1");

  try {
    await fetchSupabaseJson(url, serviceRoleKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/total_fee|column/i.test(message)) {
      throw new Error(
        "远程 freight_records 表缺少 total_fee 字段，请先执行 supabase/sql/061_add_freight_total_fee.sql",
      );
    }

    throw error;
  }
}

async function fetchAllFreights(supabaseUrl, serviceRoleKey) {
  const pageSize = 1000;
  let offset = 0;
  const records = [];

  while (true) {
    const url = new URL("/rest/v1/freight_records", supabaseUrl);
    url.searchParams.set(
      "select",
      "id,freight_unit_price,volume,extra_fee,total_fee",
    );
    url.searchParams.set("order", "created_at.desc.nullslast");
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));

    const data = await fetchSupabaseJson(url, serviceRoleKey);
    records.push(...(data ?? []));

    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }

  return records;
}

async function updateFreightTotalFee(supabaseUrl, serviceRoleKey, id, totalFee) {
  const url = new URL("/rest/v1/freight_records", supabaseUrl);
  url.searchParams.set("id", `eq.${id}`);

  await fetchSupabaseJson(url, serviceRoleKey, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ total_fee: totalFee }),
  });
}

async function main() {
  loadEnvFile();

  const apply = process.argv.includes("--apply");
  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  await verifyTargetColumn(supabaseUrl, serviceRoleKey);

  const records = await fetchAllFreights(supabaseUrl, serviceRoleKey);
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const record of records) {
    const totalFee = calculateFreightTotalFee(record);

    if (totalFee === null) {
      skipped += 1;
      continue;
    }

    if (record.total_fee !== null && Number(record.total_fee) === totalFee) {
      skipped += 1;
      continue;
    }

    if (!apply) {
      updated += 1;
      console.log(
        `预览：${record.id} total_fee ${record.total_fee ?? "null"} -> ${totalFee}`,
      );
      continue;
    }

    try {
      await updateFreightTotalFee(supabaseUrl, serviceRoleKey, record.id, totalFee);
      updated += 1;
      console.log(`已更新：${record.id} total_fee -> ${totalFee}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`失败：${record.id}，${message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        total: records.length,
        matched: updated,
        skipped,
        failed,
      },
      null,
      2,
    ),
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

await main();
