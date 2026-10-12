import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

async function loadPureModule(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const rent = await loadPureModule("./storage-rent.ts");
const permissions = await loadPureModule("../../../lib/storage-rent-permissions.ts");
const shipment = {
  id: "shipment-1", shipment_no: "S001", product_name: "产品A", box_count: 3,
  overseas_warehouse_arrived_at: "2026-09-01", appointment_time: "2026-10-01",
  delivery_status: "是", status: "有效",
};

test("到仓、送仓当天均计入，30天免费，31天收一天仓租", () => {
  assert.equal(rent.calculateStorageRent({ ...shipment, appointment_time: "2026-09-30" }), null);
  const result = rent.calculateStorageRent(shipment);
  assert.equal(result.overdue_days, 1);
  assert.equal(result.storage_fee, 2.4);
  assert.equal(rent.calculateStorageRent({ ...shipment, appointment_time: "2026-10-02" }).storage_fee, 4.8);
});

test("按日历日期处理跨年、闰年和夏令时，无时区偏差", () => {
  for (const [arrival, delivery, overdue] of [
    ["2024-02-01", "2024-03-02", 1],
    ["2025-02-01", "2025-03-03", 1],
    ["2025-12-15", "2026-01-15", 2],
    ["2026-03-01", "2026-03-31", 1],
  ]) {
    assert.equal(rent.calculateStorageRent({ ...shipment,
      overseas_warehouse_arrived_at: arrival, appointment_time: delivery,
    }).overdue_days, overdue);
  }
});

test("兼容数据库实际返回的带时间和时区的日期，保持货件页面的日历日期", () => {
  for (const [arrival, delivery] of [
    ["2026-09-01T00:00:00+00:00", "2026-10-01T00:00:00+00:00"],
    ["2026-09-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z"],
    ["2026-09-01T00:00:00+08:00", "2026-10-01T23:59:59-06:00"],
    ["2026-09-01 00:00:00+00:00", "2026-10-01"],
  ]) {
    const result = rent.calculateStorageRent({ ...shipment,
      overseas_warehouse_arrived_at: arrival, appointment_time: delivery,
    });
    assert.equal(result.overdue_days, 1);
    assert.equal(result.storage_fee, 2.4);
    assert.equal(result.overseas_warehouse_arrived_at, "2026-09-01");
    assert.equal(result.appointment_time, "2026-10-01");
  }
  assert.equal(rent.calculateStorageRent({ ...shipment,
    overseas_warehouse_arrived_at: "2026-02-30T00:00:00+00:00",
  }), null);
});

test("排除未送仓、无效、缺少日期、无效日期或日期倒置的货件", () => {
  for (const override of [
    { delivery_status: "否" }, { delivery_status: null }, { status: "无效" },
    { overseas_warehouse_arrived_at: null }, { appointment_time: null },
    { overseas_warehouse_arrived_at: "2026-02-30" },
    { appointment_time: "invalid" }, { appointment_time: "2026-08-31" },
    { appointment_time: "2026-09-01" },
  ]) assert.equal(rent.calculateStorageRent({ ...shipment, ...override }), null);
});

test("仓租按分合计，缺少有效箱数的货件明确标记，不产生NaN或错误费用", () => {
  const missing = [null, 0, -1, 1.5, NaN].map((box_count) =>
    rent.calculateStorageRent({ ...shipment, box_count }));
  assert.ok(missing.every((row) => row.storage_fee === null));
  const data = [...Array.from({ length: 1001 }, () => rent.calculateStorageRent(shipment)), ...missing];
  const summary = rent.summarizeStorageRent(data);
  assert.equal(summary.total, 1006);
  assert.equal(summary.total_fee, 2402.4);
  assert.equal(summary.missing_box_count, 5);
  assert.equal(rent.summarizeStorageRent([]).total_fee, 0);
});

test("货件号批量筛选支持中文逗号、换行、空格和去重", () => {
  assert.deepEqual(rent.splitShipmentSearchValues(["S001，S002\nS003", "S001 S004"]),
    ["S001", "S002", "S003", "S004"]);
  assert.deepEqual(rent.splitShipmentSearchValues(undefined), []);
});

test("筛选选项来自货件字段并去重，产品名称中的空格和标点完整保留", () => {
  assert.deepEqual(rent.buildStorageRentFilterOptions([
    { shipment_no: "S002", product_name: "A B，组合" },
    { shipment_no: "S001", product_name: "A B，组合" },
    { shipment_no: " S001 ", product_name: " " },
    { shipment_no: null, product_name: null },
  ]), { shipmentNos: ["S001", "S002"], productNames: ["A B，组合"] });
  assert.deepEqual(rent.normalizeProductSearchValues([" A B，组合 ", "A B，组合", "产品C"]),
    ["A B，组合", "产品C"]);
});

test("仓租权限支持管理员和明确授权角色，拒绝未登录及未授权角色", () => {
  assert.equal(permissions.canAccessStorageRent(null), false);
  assert.equal(permissions.canAccessStorageRent({ menuPermissions: ["shipments"] }), false);
  assert.equal(permissions.canAccessStorageRent({ menuPermissions: ["storage_rent"] }), true);
  assert.equal(permissions.canAccessStorageRent({ roleName: "系统管理员" }), true);
  assert.equal(permissions.canAccessStorageRent({ roleName: "普通管理员" }), true);
});

// 使用真实查询处理函数与可控数据库响应，验证分页读取、筛选和权限。
function loadRoute({ loggedIn = true, allowed = true, enabled = true } = {}) {
  const calls = [];
  const ranges = [];
  const client = { from(table) {
    const query = {
      select(...args) { calls.push([table, "select", ...args]); return this; },
      eq(...args) { calls.push([table, "eq", ...args]); return this; },
      not(...args) { calls.push([table, "not", ...args]); return this; },
      in(...args) { calls.push([table, "in", ...args]); return this; },
      ilike(...args) { calls.push([table, "ilike", ...args]); return this; },
      order() { return this; },
      range(from, to) { this.from = from; ranges.push([from, to]); return this; },
      single() { return Promise.resolve({ data: {
        status: enabled ? "启用" : "停用",
        role: { role_name: "员工", menu_permissions: allowed ? ["storage_rent"] : [] },
      }, error: null }); },
      then(resolve) {
        const count = this.from === 0 ? 500 : 1;
        return Promise.resolve({ data: Array.from({ length: count }, (_, i) => ({
          ...shipment, id: String(this.from + i),
          shipment_no: this.from === 0 ? "S001" : "S002",
          product_name: this.from === 0 ? "产品A" : "产品 B 组合",
          overseas_warehouse_arrived_at: "2026-09-01T00:00:00+00:00",
          appointment_time: "2026-10-01T00:00:00+00:00",
        })), error: null }).then(resolve);
      },
    };
    return query;
  } };
  const mocks = {
    "next/headers": { cookies: async () => ({ get: () => ({ value: "test-session" }) }) },
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/app-session": { APP_SESSION_COOKIE: "session", verifySessionToken: () => loggedIn ? { userId: "u1" } : null },
    "@/lib/supabase-admin": { createSupabaseAdminClient: () => client },
    "@/lib/storage-rent-permissions": permissions,
    "@/app/storage-rent/_lib/storage-rent": rent,
  };
  const source = readFileSync(new URL("../../api/storage-rent/route.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  const require = createRequire(import.meta.url);
  new Function("require", "exports", outputText)((name) => mocks[name] ?? require(name), exports);
  return { GET: exports.GET, calls, ranges };
}

test("接口完整读取多批数据，查询条件和合计覆盖所有筛选记录", async () => {
  const { GET, calls, ranges } = loadRoute();
  const response = await GET(new Request("http://localhost/api/storage-rent?shipment_no=S001&shipment_no=S002&product_name=产品A&product_name=产品%20B%20组合"));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(ranges, [[0, 499], [500, 999]]);
  assert.equal(result.total, 501);
  assert.equal(result.total_fee, 1202.4);
  for (const expected of [
    ["shipment_records", "eq", "status", "有效"],
    ["shipment_records", "eq", "delivery_status", "是"],
    ["shipment_records", "not", "overseas_warehouse_arrived_at", "is", null],
    ["shipment_records", "not", "appointment_time", "is", null],
    ["shipment_records", "in", "shipment_no", ["S001", "S002"]],
    ["shipment_records", "in", "product_name", ["产品A", "产品 B 组合"]],
  ]) assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(expected)));
});

test("下拉选项读取全部有效货件，不受仓租日期及送仓状态限制", async () => {
  const { GET, calls, ranges } = loadRoute();
  const response = await GET(new Request("http://localhost/api/storage-rent?options=1"));
  assert.equal(response.status, 200);
  const options = await response.json();
  assert.deepEqual(options.shipmentNos, ["S001", "S002"]);
  assert.equal(options.productNames.length, 2);
  assert.ok(options.productNames.includes("产品 B 组合"));
  assert.deepEqual(ranges, [[0, 499], [500, 999]]);
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["shipment_records", "eq", "status", "有效"])));
  assert.ok(calls.every((call) => call[2] !== "delivery_status" && call[1] !== "not"));
});

test("接口在未登录、停用或未授权时拒绝读取货件", async () => {
  for (const [options, status] of [[{ loggedIn: false }, 401], [{ allowed: false }, 403], [{ enabled: false }, 403]]) {
    const { GET, calls } = loadRoute(options);
    assert.equal((await GET(new Request("http://localhost/api/storage-rent"))).status, status);
    assert.ok(calls.every(([table]) => table !== "shipment_records"));
    assert.equal((await GET(new Request("http://localhost/api/storage-rent?options=1"))).status, status);
    assert.ok(calls.every(([table]) => table !== "shipment_records"));
  }
});
