import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CATEGORY_FIELD_MAP = {
  理发器: {
    product_english_name: "Hair Clipper",
    product_usage: "修剪头发、胡须 / For trimming hair and beard",
    product_material: "塑料、金属 / Plastic and metal",
  },
  靠枕: {
    product_english_name: "Cushion Pillow",
    product_usage: "家居、办公或车内倚靠支撑 / For back support at home, office, or in the car",
    product_material: "纺织面料、聚酯纤维填充 / Textile fabric and polyester fiber filling",
  },
  美甲打磨机: {
    product_english_name: "Nail Drill Machine",
    product_usage: "美甲打磨、修型和抛光 / For nail grinding, shaping, and polishing",
    product_material: "ABS塑料、金属 / ABS plastic and metal",
  },
  射钉枪: {
    product_english_name: "Nail Gun",
    product_usage: "木工、装修固定和钉装作业 / For woodworking, decoration fastening, and nailing",
    product_material: "金属、塑料 / Metal and plastic",
  },
  喷漆枪: {
    product_english_name: "Paint Spray Gun",
    product_usage: "表面喷漆、涂装和修补 / For surface painting, coating, and touch-up",
    product_material: "铝合金、金属、塑料 / Aluminum alloy, metal, and plastic",
  },
  打磨机: {
    product_english_name: "Grinding Machine",
    product_usage: "表面打磨、修整和抛光 / For surface grinding, trimming, and polishing",
    product_material: "塑料、金属 / Plastic and metal",
  },
  直发器: {
    product_english_name: "Hair Straightener",
    product_usage: "头发拉直和造型 / For hair straightening and styling",
    product_material: "塑料、陶瓷、金属 / Plastic, ceramic, and metal",
  },
  洁牙器: {
    product_english_name: "Dental Water Flosser",
    product_usage: "口腔清洁和牙缝冲洗 / For oral cleaning and interdental rinsing",
    product_material: "塑料、硅胶、电子元件 / Plastic, silicone, and electronic components",
  },
  稳压器: {
    product_english_name: "Voltage Regulator",
    product_usage: "稳定输出电压和保护用电设备 / For stabilizing output voltage and protecting electrical devices",
    product_material: "塑料、铜、电子元件 / Plastic, copper, and electronic components",
  },
  直发梳: {
    product_english_name: "Hair Straightening Brush",
    product_usage: "头发梳理、拉直和造型 / For combing, straightening, and styling hair",
    product_material: "塑料、陶瓷、电子元件 / Plastic, ceramic, and electronic components",
  },
};

const TEXTILE_PRODUCT_NAMES = new Set(["灰色一体", "常规分体", "灰色分体"]);

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

async function fetchAllProducts(supabaseUrl, serviceRoleKey) {
  const pageSize = 1000;
  let offset = 0;
  const products = [];

  while (true) {
    const url = new URL("/rest/v1/products", supabaseUrl);
    url.searchParams.set("select", "id,product_name,product_category");
    url.searchParams.set("order", "created_at.desc.nullslast");
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));

    const data = await fetchSupabaseJson(url, serviceRoleKey);
    products.push(...(data ?? []));

    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }

  return products;
}

async function verifyTargetColumns(supabaseUrl, serviceRoleKey) {
  const url = new URL("/rest/v1/products", supabaseUrl);
  url.searchParams.set(
    "select",
    "id,product_english_name,product_usage,product_material,product_attribute",
  );
  url.searchParams.set("limit", "1");

  try {
    await fetchSupabaseJson(url, serviceRoleKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      /product_english_name|product_usage|product_material|product_attribute|column/i.test(
        message,
      )
    ) {
      throw new Error(
        "远程 products 表缺少回填目标字段，请先执行 supabase/sql/053_add_product_extra_fields.sql 和 supabase/sql/054_add_product_material.sql",
      );
    }

    throw error;
  }
}

function buildProductPatch(product) {
  const category = product.product_category?.trim();
  if (!category) return null;
  const generatedFields = CATEGORY_FIELD_MAP[category];
  if (!generatedFields) return null;
  const productName = product.product_name?.trim() || "";

  return {
    ...generatedFields,
    product_attribute: TEXTILE_PRODUCT_NAMES.has(productName) ? "纺织品" : "普货",
  };
}

async function updateProduct(supabaseUrl, serviceRoleKey, productId, patch) {
  const url = new URL("/rest/v1/products", supabaseUrl);
  url.searchParams.set("id", `eq.${productId}`);

  await fetchSupabaseJson(url, serviceRoleKey, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
}

async function main() {
  loadEnvFile();

  const apply = process.argv.includes("--apply");
  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (apply) {
    await verifyTargetColumns(supabaseUrl, serviceRoleKey);
  }

  const products = await fetchAllProducts(supabaseUrl, serviceRoleKey);

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const missingCategories = new Map();

  for (const product of products) {
    const patch = buildProductPatch(product);
    const category = product.product_category?.trim() || "(空)";

    if (!patch) {
      skipped += 1;
      missingCategories.set(category, (missingCategories.get(category) ?? 0) + 1);
      continue;
    }

    if (!apply) {
      updated += 1;
      console.log(
        `预览：${product.product_name ?? product.id} [${category}] -> ${JSON.stringify(
          patch,
        )}`,
      );
      continue;
    }

    try {
      await updateProduct(supabaseUrl, serviceRoleKey, product.id, patch);
      updated += 1;
      console.log(`已更新：${product.product_name ?? product.id} [${category}]`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`失败：${product.product_name ?? product.id} [${category}]，${message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        total: products.length,
        matched: updated,
        skipped,
        failed,
        missingCategories: Object.fromEntries(missingCategories),
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
