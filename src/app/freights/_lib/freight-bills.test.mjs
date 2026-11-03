import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const { outputText } = ts.transpileModule(
  readFileSync(new URL("./freight-bills.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
);

function loadBills(failedIds = new Set()) {
  const calls = [];
  let active = 0;
  let peakActive = 0;
  const request = (provider) => async (values) => {
    calls.push({ provider, ...values });
    active += 1;
    peakActive = Math.max(peakActive, active);
    await Promise.resolve();
    active -= 1;
    if (failedIds.has(values.freightId)) throw new Error("Token过期或账单暂未生成");
    return { billAmount: 120, totalFee: 100, isConsistent: false };
  };
  const mocks = {
    fetchRishenghuiFreightBill: request("日升辉"),
    fetchTongtuFreightBill: request("通途"),
    fetchSaleasyFreightBill: request("赛易"),
    fetchTangchaoFreightBill: request("唐朝"),
  };
  const exports = {};
  new Function("require", "exports", outputText)((name) => {
    assert.equal(name, "./freights-request");
    return mocks;
  }, exports);
  return { ...exports, calls, peakActive: () => peakActive };
}

function record(id, overrides = {}) {
  return {
    id, shipment_no: `S${id}`, tracking_no: `T${id}`, logistics_provider: "通途",
    freight_paid_status: "否", total_fee: 100, bill_amount: null, ...overrides,
  };
}

test("混合物流商按现有接口逐条处理，去重并保留金额差异", async () => {
  const bills = loadBills();
  const records = ["日升辉", "通途", "赛易", "唐朝"].map((provider, index) =>
    record(String(index), { logistics_provider: ` ${provider} ` }));
  const progress = [];
  const results = await bills.generateFreightBills([...records, records[0]], " token ", (...values) => progress.push(values));
  assert.equal(results.length, 4);
  assert.ok(results.every((item) => item.status === "success" && item.billAmount === 120 && item.isConsistent === false));
  assert.deepEqual(bills.calls.map((call) => call.provider), ["日升辉", "通途", "赛易", "唐朝"]);
  assert.equal(bills.calls[0].accessToken, "token");
  assert.ok(bills.calls.slice(1).every((call) => !("accessToken" in call)));
  assert.equal(bills.peakActive(), 1);
  assert.deepEqual(progress, [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4]]);
});

test("跳过已支付、已有账单（包括零元）、缺少费用或单号及不支持的物流商", async () => {
  const bills = loadBills();
  const records = [
    { freight_paid_status: "是" }, { bill_amount: 0 }, { bill_amount: 100 },
    { total_fee: null }, { total_fee: NaN }, { total_fee: Infinity },
    { shipment_no: " " }, { logistics_provider: "日升辉", tracking_no: null },
    { logistics_provider: "赛易", tracking_no: "" },
    { logistics_provider: "唐朝", tracking_no: " " },
    { logistics_provider: "未知物流" },
  ].map((override, index) => record(String(index), override));
  const results = await bills.generateFreightBills(records, "token");
  assert.equal(bills.calls.length, 0);
  assert.ok(results.every((item) => item.status === "skipped" && item.message));
  assert.equal(bills.getBatchBillSkipReason(record("zero", { total_fee: 0 })), null);
  assert.equal(bills.getBatchBillSkipReason(record("tongtu", { tracking_no: null })), null);
});

test("单条失败不阻断后续记录，重试仅处理失败项", async () => {
  const failedIds = new Set(["2"]);
  const bills = loadBills(failedIds);
  const results = await bills.generateFreightBills([record("1"), record("2"), record("3")]);
  assert.deepEqual(results.map((item) => item.status), ["success", "failed", "success"]);
  assert.match(results[1].message, /Token/);
  failedIds.clear();
  const retried = await bills.generateFreightBills(results.filter((item) => item.status === "failed").map((item) => item.record));
  assert.equal(retried[0].status, "success");
  assert.deepEqual(bills.calls.map((call) => call.freightId), ["1", "2", "3", "2"]);
});

test("日升辉缺少Token明确报错，其他物流商仍可生成账单", async () => {
  const bills = loadBills();
  const results = await bills.generateFreightBills([
    record("rsh", { logistics_provider: "日升辉" }), record("tongtu"),
  ]);
  assert.equal(results[0].status, "failed");
  assert.match(results[0].message, /请先获取日升辉Token/);
  assert.equal(results[1].status, "success");
  assert.equal(bills.calls.length, 1);
  assert.deepEqual(await bills.generateFreightBills([]), []);
});
