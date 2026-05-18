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

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    );
}

function stripTags(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForMatch(value) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function commonCharRatio(keyword, name) {
  if (!keyword || !name) return 0;

  const nameChars = new Set(Array.from(name));
  const keywordChars = Array.from(new Set(Array.from(keyword)));
  const matched = keywordChars.filter((char) => nameChars.has(char)).length;

  return matched / Math.max(keywordChars.length, 1);
}

function scoreCandidate(keyword, candidate) {
  const normalizedKeyword = normalizeForMatch(keyword);
  const normalizedName = normalizeForMatch(candidate.name);

  if (!normalizedKeyword || !normalizedName) return 0;

  let score = 0;
  if (normalizedName === normalizedKeyword) score += 1000;
  if (normalizedName.startsWith(normalizedKeyword)) score += 800;
  if (normalizedName.includes(normalizedKeyword)) score += 600;
  if (normalizedKeyword.includes(normalizedName)) score += 400;

  score += Math.round(commonCharRatio(normalizedKeyword, normalizedName) * 200);
  score -= Math.abs(normalizedName.length - normalizedKeyword.length);

  return score;
}

function parseCustomsCodeCandidates(html) {
  const rows =
    html.match(/<tr[^>]*class=["'][^"']*result-grid[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi) ??
    [];

  return rows
    .map((row) => {
      const cells = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map(
        (match) => match[1] ?? "",
      );
      const codeCell = cells[0] ?? "";
      const nameCell = cells[1] ?? "";
      const code =
        codeCell.match(/\/Code\/(\d+)\.html/i)?.[1] ??
        stripTags(codeCell).match(/\b\d{8,13}\b/)?.[0];

      if (!code) return null;

      return {
        code,
        name: stripTags(nameCell),
        expired: /\[过期\]/.test(stripTags(codeCell)),
      };
    })
    .filter(Boolean);
}

async function lookupCustomsCode(keyword) {
  const response = await fetch(
    `https://www.hsbianma.com/search?keywords=${encodeURIComponent(keyword)}`,
    {
      cache: "no-store",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      },
      signal: AbortSignal.timeout(10000),
    },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const candidates = parseCustomsCodeCandidates(await response.text());
  const activeCandidates = candidates.filter((item) => !item.expired);
  const sourceCandidates = activeCandidates.length ? activeCandidates : candidates;
  const bestCandidate = sourceCandidates
    .map((item) => ({ ...item, score: scoreCandidate(keyword, item) }))
    .sort((a, b) => b.score - a.score)[0];

  return bestCandidate?.code ?? null;
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

async function fetchAllProducts(supabaseUrl, serviceRoleKey) {
  const pageSize = 1000;
  let from = 0;
  const products = [];

  while (true) {
    const url = new URL("/rest/v1/products", supabaseUrl);
    url.searchParams.set("select", "id,product_name,product_category,customs_code");
    url.searchParams.set("order", "created_at.desc.nullslast");
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(from));

    const data = await fetchSupabaseJson(url, serviceRoleKey);
    products.push(...(data ?? []));

    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return products;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function main() {
  loadEnvFile();

  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  const products = await fetchAllProducts(supabaseUrl, serviceRoleKey);
  const categoryCache = new Map();
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const product of products) {
    const category = product.product_category?.trim();
    if (!category) {
      skipped += 1;
      continue;
    }

    try {
      if (!categoryCache.has(category)) {
        categoryCache.set(category, await lookupCustomsCode(category));
        await sleep(300);
      }

      const customsCode = categoryCache.get(category);
      if (!customsCode) {
        skipped += 1;
        console.log(`跳过：${product.product_name ?? product.id}，${category} 未查到编码`);
        continue;
      }

      if (product.customs_code === customsCode) {
        skipped += 1;
        continue;
      }

      const updateUrl = new URL("/rest/v1/products", supabaseUrl);
      updateUrl.searchParams.set("id", `eq.${product.id}`);

      await fetchSupabaseJson(updateUrl, serviceRoleKey, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          prefer: "return=minimal",
        },
        body: JSON.stringify({ customs_code: customsCode }),
      });

      updated += 1;
      console.log(`已更新：${product.product_name ?? product.id} -> ${customsCode}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`失败：${product.product_name ?? product.id}，${message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        total: products.length,
        updated,
        skipped,
        failed,
        categoryCount: categoryCache.size,
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
