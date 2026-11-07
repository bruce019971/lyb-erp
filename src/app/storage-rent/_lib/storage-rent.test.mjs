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
  overseas_warehouse_arrived_at: "2026-09-01", appointment_time: "2026-10-02",
  delivery_status: "是", status: "有效", storage_rent_paid_status: "否",
};

test("按日期差计算仓储天数，原超期1天改为免租，31天收一天仓租", () => {
  for (const appointment_time of ["2026-09-01", "2026-09-30", "2026-10-01"]) {
    const free = rent.calculateStorageRent({ ...shipment, appointment_time });
    assert.equal(free.overdue_days, 0);
    assert.equal(free.storage_fee, 0);
  }
  const result = rent.calculateStorageRent(shipment);
  assert.equal(result.overdue_days, 1);
  assert.equal(result.storage_fee, 2.4);
  assert.equal(rent.calculateStorageRent({ ...shipment, appointment_time: "2026-10-03" }).storage_fee, 4.8);
});

test("账单货件70459003超期天数由12减为11，仓租同步减少一天", () => {
  const result = rent.calculateStorageRent({ ...shipment,
    shipment_no: "70459003", box_count: 4,
    overseas_warehouse_arrived_at: "2026-08-14", appointment_time: "2026-09-24",
  });
  assert.equal(result.overdue_days, 11);
  assert.equal(result.storage_fee, 35.2);
});

test("按仓储天数分段累计，31至60天每箱每天0.8元，61至90天每箱每天1元", () => {
  for (const [storageDays, feePerBox] of [
    [31, 0.8], [59, 23.2], [60, 24], [61, 25], [75, 39], [89, 53], [90, 54], [91, 54.8],
  ]) {
    const deliveryDate = new Date(Date.UTC(2026, 8, 1 + storageDays)).toISOString().slice(0, 10);
    const result = rent.calculateStorageRent({ ...shipment, appointment_time: deliveryDate });
    assert.equal(result.overdue_days, storageDays - 30);
    assert.equal(result.storage_fee, Math.round(feePerBox * 100) * shipment.box_count / 100);
  }
});

test("合计包含跨档费用，不把前30个收费日追溯改按1元计算", () => {
  const data = [
    rent.calculateStorageRent({ ...shipment, box_count: 2, appointment_time: "2026-10-31" }),
    rent.calculateStorageRent({ ...shipment, box_count: 3, appointment_time: "2026-11-01" }),
    rent.calculateStorageRent({ ...shipment, box_count: 1, appointment_time: "2026-11-30" }),
  ];
  assert.deepEqual(data.map((row) => row.storage_fee), [48, 75, 54]);
  assert.equal(rent.summarizeStorageRent(data).total_fee, 177);
});

test("按日历日期处理跨年、闰年和夏令时，无时区偏差", () => {
  for (const [arrival, delivery, overdue] of [
    ["2024-02-01", "2024-03-03", 1],
    ["2025-02-01", "2025-03-04", 1],
    ["2025-12-15", "2026-01-15", 1],
    ["2026-03-01", "2026-04-01", 1],
  ]) {
    assert.equal(rent.calculateStorageRent({ ...shipment,
      overseas_warehouse_arrived_at: arrival, appointment_time: delivery,
    }).overdue_days, overdue);
  }
});

test("兼容数据库实际返回的带时间和时区的日期，保持货件页面的日历日期", () => {
  for (const [arrival, delivery] of [
    ["2026-09-01T00:00:00+00:00", "2026-10-02T00:00:00+00:00"],
    ["2026-09-01T00:00:00.000Z", "2026-10-02T00:00:00.000Z"],
    ["2026-09-01T00:00:00+08:00", "2026-10-02T23:59:59-06:00"],
    ["2026-09-01 00:00:00+00:00", "2026-10-02"],
  ]) {
    const result = rent.calculateStorageRent({ ...shipment,
      overseas_warehouse_arrived_at: arrival, appointment_time: delivery,
    });
    assert.equal(result.overdue_days, 1);
    assert.equal(result.storage_fee, 2.4);
    assert.equal(result.overseas_warehouse_arrived_at, "2026-09-01");
    assert.equal(result.appointment_time, "2026-10-02");
  }
  assert.equal(rent.calculateStorageRent({ ...shipment,
    overseas_warehouse_arrived_at: "2026-02-30T00:00:00+00:00",
  }).storage_fee, null);
});

test("排除无效或未约仓货件，已约仓未送仓货件正常计租", () => {
  for (const override of [
    { status: "无效" }, { appointment_time: null }, { appointment_time: "" }, { appointment_time: "  " },
  ]) assert.equal(rent.calculateStorageRent({ ...shipment, ...override }), null);
  for (const delivery_status of ["否", null]) {
    const record = rent.calculateStorageRent({ ...shipment, delivery_status });
    assert.equal(record.overdue_days, 1);
    assert.equal(record.storage_fee, 2.4);
  }
});

test("已约仓但日期不完整或无效的货件仍显示，缺失费用不作为零元", () => {
  for (const override of [
    { overseas_warehouse_arrived_at: null },
    { overseas_warehouse_arrived_at: "2026-02-30" },
    { appointment_time: "invalid" }, { appointment_time: "2026-08-31" },
  ]) {
    const record = rent.calculateStorageRent({ ...shipment, ...override });
    assert.equal(record.overdue_days, null);
    assert.equal(record.storage_fee, null);
    assert.match(record.calculation_note, /无法计算仓租/);
  }
});

test("免租期内无需箱数也能明确计算为0元，合计区分零元和无法计算", () => {
  const free = rent.calculateStorageRent({ ...shipment, box_count: null, appointment_time: "2026-10-01" });
  const missingDate = rent.calculateStorageRent({ ...shipment, overseas_warehouse_arrived_at: null });
  const chargeable = rent.calculateStorageRent({ ...shipment, delivery_status: "否" });
  assert.equal(free.storage_fee, 0);
  assert.equal(free.calculation_note, null);
  assert.deepEqual(rent.summarizeStorageRent([free, missingDate, chargeable]), {
    data: [free, missingDate, chargeable], total: 3, total_fee: 2.4, uncalculated_count: 1,
  });
});

test("仓租按分合计，缺少有效箱数的货件明确标记，不产生NaN或错误费用", () => {
  const missing = [null, 0, -1, 1.5, NaN].map((box_count) =>
    rent.calculateStorageRent({ ...shipment, box_count }));
  assert.ok(missing.every((row) => row.storage_fee === null));
  const data = [...Array.from({ length: 1001 }, () => rent.calculateStorageRent(shipment)), ...missing];
  const summary = rent.summarizeStorageRent(data);
  assert.equal(summary.total, 1006);
  assert.equal(summary.total_fee, 2402.4);
  assert.equal(summary.uncalculated_count, 5);
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
function loadRoute({ loggedIn = true, allowed = true, enabled = true,
  rows = null, readError = null, writeError = null } = {}) {
  const calls = [];
  const ranges = [];
  const client = { from(table) {
    const query = {
      filters: [],
      select(...args) { calls.push([table, "select", ...args]); return this; },
      eq(...args) { calls.push([table, "eq", ...args]); this.filters.push((row) => row[args[0]] === args[1]); return this; },
      not(...args) { calls.push([table, "not", ...args]); this.filters.push((row) => row[args[0]] !== args[2]); return this; },
      in(...args) { calls.push([table, "in", ...args]); this.filters.push((row) => args[1].includes(row[args[0]])); return this; },
      update(values) { calls.push([table, "update", values]); this.values = values; return this; },
      ilike(...args) { calls.push([table, "ilike", ...args]); return this; },
      order() { return this; },
      range(from, to) { this.from = from; ranges.push([from, to]); return this; },
      single() { return Promise.resolve({ data: {
        status: enabled ? "启用" : "停用",
        role: { role_name: "员工", menu_permissions: allowed ? ["storage_rent"] : [] },
      }, error: null }); },
      then(resolve) {
        if (rows !== null) {
          const error = this.values ? writeError : readError;
          if (error) return Promise.resolve({ data: null, error: { message: error } }).then(resolve);
          const matching = rows.filter((row) => this.filters.every((predicate) => predicate(row)));
          if (this.values) matching.forEach((row) => Object.assign(row, this.values));
          return Promise.resolve({ data: matching.map((row) => ({ ...row })), error: null }).then(resolve);
        }
        const count = this.from === 0 ? 500 : 1;
        return Promise.resolve({ data: Array.from({ length: count }, (_, i) => ({
          ...shipment, id: String(this.from + i),
          shipment_no: this.from === 0 ? "S001" : "S002",
          product_name: this.from === 0 ? "产品A" : "产品 B 组合",
          overseas_warehouse_arrived_at: "2026-09-01T00:00:00+00:00",
          appointment_time: "2026-10-02T00:00:00+00:00",
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
  return { GET: exports.GET, PATCH: exports.PATCH, calls, ranges };
}

test("接口完整读取多批数据，查询条件和合计覆盖所有筛选记录", async () => {
  const { GET, calls, ranges } = loadRoute();
  const response = await GET(new Request("http://localhost/api/storage-rent?shipment_no=S001&shipment_no=S002&product_name=产品A&product_name=产品%20B%20组合"));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(ranges, [[0, 499], [500, 999]]);
  assert.equal(result.total, 501);
  assert.equal(result.total_fee, 1202.4);
  assert.ok(result.data.every((record) => record.storage_rent_paid_status === "否"));
  for (const expected of [
    ["shipment_records", "eq", "status", "有效"],
    ["shipment_records", "not", "appointment_time", "is", null],
    ["shipment_records", "in", "shipment_no", ["S001", "S002"]],
    ["shipment_records", "in", "product_name", ["产品A", "产品 B 组合"]],
  ]) assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(expected)));
  assert.ok(calls.every((call) => call[2] !== "delivery_status" && call[2] !== "overseas_warehouse_arrived_at"));
});

test("列表显示所有已约仓有效货件，包含未送仓、免租和日期缺失，筛选合计同步变化", async () => {
  const rows = [
    { ...shipment, id: "1", shipment_no: "S001", delivery_status: "否" },
    { ...shipment, id: "2", shipment_no: "S002", appointment_time: "2026-10-01" },
    { ...shipment, id: "3", shipment_no: "S003", overseas_warehouse_arrived_at: null },
    { ...shipment, id: "4", appointment_time: null },
    { ...shipment, id: "5", status: "无效" },
    { ...shipment, id: "6", shipment_no: "S006", box_count: null },
  ];
  const { GET } = loadRoute({ rows });
  const result = await (await GET(new Request("http://localhost/api/storage-rent"))).json();
  assert.deepEqual(result.data.map((r) => r.id), ["1", "2", "3", "6"]);
  assert.deepEqual(result.data.map((r) => r.storage_fee), [2.4, 0, null, null]);
  assert.equal(result.total, 4);
  assert.equal(result.total_fee, 2.4);
  assert.equal(result.uncalculated_count, 2);
  const filtered = await (await GET(new Request("http://localhost/api/storage-rent?shipment_no=S002&shipment_no=S003"))).json();
  assert.equal(filtered.total, 2);
  assert.equal(filtered.total_fee, 0);
  assert.equal(filtered.uncalculated_count, 1);
});

const paymentIds = [1, 2, 3, 4].map((n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
const paymentRequest = (ids) => new Request("http://localhost/api/storage-rent", {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }),
});

test("批量支付只更新选中仓租、去重并跳过已支付记录，刷新后保留状态", async () => {
  const rows = paymentIds.map((id, i) => ({ ...shipment, id,
    freight_paid_status: "否", storage_rent_paid_status: i === 2 ? "是" : "否",
  }));
  const { PATCH, GET, calls } = loadRoute({ rows });
  const response = await PATCH(paymentRequest([paymentIds[0], paymentIds[1], paymentIds[2], paymentIds[0]]));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { updatedCount: 2 });
  assert.deepEqual(rows.map((row) => row.storage_rent_paid_status), ["是", "是", "是", "否"]);
  assert.ok(rows.every((row) => row.freight_paid_status === "否"));
  const refreshed = await (await GET(new Request("http://localhost/api/storage-rent"))).json();
  assert.deepEqual(refreshed.data.map((row) => row.storage_rent_paid_status), ["是", "是", "是", "否"]);
  assert.equal(refreshed.total_fee, 9.6);
  const repeated = await PATCH(paymentRequest(paymentIds.slice(0, 3)));
  assert.deepEqual(await repeated.json(), { updatedCount: 0 });
  assert.equal(calls.filter(([, op]) => op === "update").length, 1);
});

test("批量支付拒绝未登录、停用和未授权用户，不能写入数据库", async () => {
  for (const [options, status] of [[{ loggedIn: false }, 401], [{ allowed: false }, 403], [{ enabled: false }, 403]]) {
    const { PATCH, calls } = loadRoute(options);
    assert.equal((await PATCH(paymentRequest([paymentIds[0]]))).status, status);
    assert.ok(calls.every(([table]) => table !== "shipment_records"));
  }
});

test("批量支付拒绝空列表、错误ID、超限和损坏的JSON", async () => {
  for (const ids of [undefined, [], "bad", [null], [123], ["bad"], Array(501).fill(paymentIds[0])]) {
    const { PATCH, calls } = loadRoute();
    assert.equal((await PATCH(paymentRequest(ids))).status, 400);
    assert.ok(calls.every(([table]) => table !== "shipment_records"));
  }
  const { PATCH } = loadRoute();
  assert.equal((await PATCH(new Request("http://localhost/api/storage-rent", { method: "PATCH", body: "{" }))).status, 400);
});

test("批量支付发现不存在或不符合仓租条件的货件时，整批不写入", async () => {
  for (const override of [null, { status: "无效" },
    { box_count: null }, { box_count: 0 }, { appointment_time: null },
    { overseas_warehouse_arrived_at: null }, { appointment_time: "2026-08-31" }]) {
    const rows = [{ ...shipment, id: paymentIds[0] }];
    if (override) rows.push({ ...shipment, id: paymentIds[1], ...override });
    const { PATCH, calls } = loadRoute({ rows });
    const response = await PATCH(paymentRequest(paymentIds.slice(0, 2)));
    assert.equal(response.status, 409);
    assert.ok(calls.every(([, op]) => op !== "update"));
    assert.equal(rows[0].storage_rent_paid_status, "否");
  }
});

test("已约仓未送仓及免租记录可保存支付状态，列表与批量操作条件一致", async () => {
  const rows = [
    { ...shipment, id: paymentIds[0], delivery_status: "否" },
    { ...shipment, id: paymentIds[1], delivery_status: null, appointment_time: "2026-10-01", box_count: null },
  ];
  const { PATCH } = loadRoute({ rows });
  const response = await PATCH(paymentRequest(paymentIds.slice(0, 2)));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { updatedCount: 2 });
  assert.ok(rows.every((r) => r.storage_rent_paid_status === "是"));
});

test("批量支付读取或保存失败时返回错误，不报告支付成功", async () => {
  for (const options of [{ readError: "read failed" }, { writeError: "write failed" }]) {
    const rows = [{ ...shipment, id: paymentIds[0] }];
    const { PATCH } = loadRoute({ rows, ...options });
    const response = await PATCH(paymentRequest([paymentIds[0]]));
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /failed/);
    assert.equal(rows[0].storage_rent_paid_status, "否");
  }
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
