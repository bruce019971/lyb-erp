import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadModule(path, mocks = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  new Function("require", "exports", outputText)((name) => mocks[name] ?? require(name), exports);
  return exports;
}
const fee = loadModule("./relabel-fee.ts");
const tracks = loadModule("../../shipment-tracks/_lib/shipment-tracks.ts");
const record = {
  id: "r1", original_shipment_no: "S1", relabel_type: "外箱标及产品标",
  relabel_fee: 35, box_count: 10,
};
const context = { duration_days: 51, carton_label_unit_price: 2 };

test("50天仍收外箱标费用，51天起仅扣外箱标费用", () => {
  assert.equal(fee.calculatePayableRelabelFee(record, { ...context, duration_days: 50 }), 35);
  assert.equal(fee.calculatePayableRelabelFee(record, context), 15);
  assert.equal(fee.calculatePayableRelabelFee({ ...record, relabel_type: "外箱标", relabel_fee: 20 }, context), 0);
  assert.equal(fee.calculatePayableRelabelFee({ ...record, relabel_type: "产品标", relabel_fee: 15 }, context), 15);
});

test("无时效不扣费，缺失必要费用信息不输出错误金额", () => {
  for (const duration_days of [null, undefined, NaN, 0, -1]) {
    assert.equal(fee.calculatePayableRelabelFee(record, { ...context, duration_days }), 35);
  }
  assert.equal(fee.calculatePayableRelabelFee(record), 35);
  assert.equal(fee.calculatePayableRelabelFee({ ...record, box_count: null }, context), null);
  assert.equal(fee.calculatePayableRelabelFee(record, { ...context, carton_label_unit_price: null }), null);
  assert.equal(fee.calculatePayableRelabelFee({ ...record, relabel_fee: null }, context), null);
  assert.equal(fee.calculatePayableRelabelFee({ ...record, relabel_type: "外箱标" }, { ...context, carton_label_unit_price: null }), 0);
});

test("按分扣减且不会产生负数或重复扣费", () => {
  const original = { ...record, relabel_fee: 0.3, box_count: 2 };
  const price = { ...context, carton_label_unit_price: 0.1 };
  const displayed = { ...original, payable_relabel_fee: fee.calculatePayableRelabelFee(original, price) };
  assert.equal(displayed.payable_relabel_fee, 0.1);
  assert.equal(fee.calculatePayableRelabelFee(displayed, price), 0.1);
  assert.equal(original.relabel_fee, 0.3);
  assert.equal(fee.calculatePayableRelabelFee({ ...record, relabel_fee: 1 }, context), 0);
});

function loadRequests({ count = 1, failedTable, missingPrice = false } = {}) {
  const calls = [];
  const records = Array.from({ length: count }, (_, i) => ({ ...record, id: `r${i}` }));
  const client = { from(table) {
    const filters = [];
    let from = 0;
    let to = 999;
    return {
      select() { return this; },
      order() { return this; },
      eq(field, value) { calls.push([table, "eq", field, value]); return this; },
      in(field, values) { filters.push([field, values]); calls.push([table, "in", field, values]); return this; },
      ilike() { return this; },
      not() { return this; },
      or() { return this; },
      range(start, end) { from = start; to = end; calls.push([table, "range", start, end]); return this; },
      then(resolve, reject) {
        let data = [];
        if (table === "relabel_records") data = records.slice(from, to + 1);
        if (table === "shipment_records") {
          const shipmentNos = filters.find(([field]) => field === "shipment_no")?.[1] ?? ["S1"];
          data = shipmentNos.map((shipment_no, i) => ({
            shipment_no, logistics_provider: "物流A", product_name: "产品A", order_store: "店铺A",
            shipment_tracks: i % 2
              ? [{ sailing_time: "2026-08-01", warehouse_arrived_time: "2026-09-21" }]
              : { sailing_time: "2026-08-01T00:00:00+00:00", warehouse_arrived_time: "2026-09-21T00:00:00+00:00" },
          })).slice(from, to + 1);
        }
        if (table === "logistics_providers") data = [{ provider_name: "物流A", carton_label_unit_price: missingPrice ? null : 2 }];
        return Promise.resolve({ data, count: records.length, error: table === failedTable ? new Error("读取失败") : null }).then(resolve, reject);
      },
    };
  } };
  const contexts = loadModule("./relabel-fee-request.ts", {
    "@/lib/supabase": { supabase: client },
    "../../shipment-tracks/_lib/shipment-tracks": tracks,
  });
  const requests = loadModule("./relabels-request.ts", {
    "@/lib/supabase": { supabase: client },
    "./relabels": {},
    "./relabel-fee": fee,
    "./relabel-fee-request": contexts,
    "./relabel-download-state": { getPendingRelabelDownloadIds: () => [] },
  });
  return { ...requests, ...contexts, calls };
}

test("列表按原货件关联时效和物流商价格，保留原始费用供编辑", async () => {
  const requests = loadRequests();
  const result = await requests.requestRelabelRecords({});
  assert.equal(result.success, true);
  assert.equal(result.data[0].duration_days, 51);
  assert.equal(result.data[0].relabel_fee, 35);
  assert.equal(result.data[0].payable_relabel_fee, 15);
  assert.equal(await requests.requestRelabelFeeSummary({}), 15);
});

test("费用合计完整读取多页，保留物流商筛选", async () => {
  const requests = loadRequests({ count: 1001 });
  assert.equal(await requests.requestRelabelFeeSummary({ logistics_provider: ["物流A"] }), 15015);
  assert.ok(requests.calls.some((call) => JSON.stringify(call) === JSON.stringify(["relabel_records", "range", 1000, 1999])));
  assert.ok(requests.calls.some((call) => JSON.stringify(call) === JSON.stringify(["relabel_records", "in", "original_shipment_no", ["S1"]])));
});

test("批量关联去重分批读取，兼容单对象和数组关系", async () => {
  const requests = loadRequests();
  const nos = Array.from({ length: 205 }, (_, i) => `S${i}`);
  const contexts = await requests.requestRelabelFeeContexts([...nos, "S1", ""]);
  assert.equal(contexts.size, 205);
  assert.deepEqual(contexts.get("S1"), context);
  assert.equal(requests.calls.filter(([table, method]) => table === "shipment_records" && method === "in").length, 3);
});

test("关联查询失败或扣费价格缺失时，合计报错而非显示错误总额", async () => {
  for (const failedTable of ["shipment_records", "logistics_providers"]) {
    await assert.rejects(loadRequests({ failedTable }).requestRelabelFeeSummary({}), /读取失败/);
  }
  await assert.rejects(loadRequests({ missingPrice: true }).requestRelabelFeeSummary({}), /缺少外箱数或外箱标单价/);
});
