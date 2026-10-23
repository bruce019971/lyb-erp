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
const estimates = loadModule("./shipment-tracks.ts");

test("预计时效只接受正整数，拒绝空值、小数、字符串和超出数据库范围的值", () => {
  for (const value of [null, undefined, "20", 0, -1, 1.5, NaN, Infinity, 2147483648]) {
    assert.equal(estimates.isValidEstimatedDuration(value), false);
  }
  assert.equal(estimates.isValidEstimatedDuration(30), true);
});

test("未开船或无时效时不计算；跨月、跨年、闰年按日历天计算", () => {
  for (const [sailing, days, expected] of [
    [null, 30, null], ["2026-10-23", null, null],
    ["2026-10-23", 30, "2026-11-22"],
    ["2026-12-25", 10, "2027-01-04"],
    ["2024-02-28", 2, "2024-03-01"],
    ["2026-03-07", 2, "2026-03-09"],
    ["2026-10-23T00:00:00+08:00", 2, "2026-10-25"],
  ]) {
    assert.equal(estimates.calculateEstimatedWarehouseArrival(sailing, days), expected);
  }
});

test("预计送仓日期须至少晚两天，只有清关中且尚未到仓的货件能编辑", () => {
  const record = {
    latest_track: "清关中", warehouse_arrived_time: null,
    estimated_warehouse_arrived_time: "2026-10-23",
  };
  assert.equal(estimates.canEditEstimatedDelivery(record), true);
  for (const overrides of [
    { latest_track: "已开船" }, { latest_track: "已到仓" },
    { warehouse_arrived_time: "2026-10-23" }, { estimated_warehouse_arrived_time: null },
  ]) assert.equal(estimates.canEditEstimatedDelivery({ ...record, ...overrides }), false);
  assert.equal(estimates.isValidEstimatedDeliveryDate(null, "2026-10-25"), false);
  for (const date of ["2026-10-22", "2026-10-23", "2026-10-24"]) {
    assert.equal(estimates.isValidEstimatedDeliveryDate("2026-10-23", date), false);
  }
  assert.equal(estimates.isValidEstimatedDeliveryDate("2026-10-23", "2026-10-25"), true);
  assert.equal(estimates.isValidEstimatedDeliveryDate("2026-12-31", "2027-01-02"), true);
});

function loadPatch(existing = {}, authorized = true) {
  const updates = [];
  const row = {
    shipment_record_id: "shipment-1", latest_track: "清关中",
    sailing_time: "2026-10-01", estimated_duration_days: 22,
    warehouse_arrived_time: null, ...existing,
  };
  const client = { from(table) {
    let update;
    return {
      select() { return this; }, eq() { return this; },
      update(value) { update = value; updates.push(value); return this; },
      async single() {
        return { error: null, data: table === "system_users"
          ? { id: "operator", status: "启用", role: { menu_permissions: authorized ? ["shipment_tracks"] : [] } }
          : { id: "track-1", ...row, ...update } };
      },
    };
  } };
  const route = loadModule("../../api/shipment-tracks/[id]/route.ts", {
    "next/headers": { cookies: async () => ({ get: () => ({ value: "session" }) }) },
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/app-session": { APP_SESSION_COOKIE: "session", verifySessionToken: () => ({ userId: "operator" }) },
    "@/lib/supabase-admin": { createSupabaseAdminClient: () => client },
    "@/app/shipment-tracks/_lib/shipment-tracks": estimates,
    "../_shipment-warehouse-sync": { syncShipmentWarehouseArrivedAt: async () => {} },
  });
  return {
    updates,
    patch: (body) => route.PATCH(new Request("http://localhost/api/shipment-tracks/track-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: "track-1" }) }),
  };
}

test("接口拒绝绕过界面的非法天数和日期，不写入数据库", async () => {
  for (const body of [
    { estimated_duration_days: 0 }, { estimated_duration_days: 2.5 },
    { estimated_duration_days: "22" }, { estimated_duration_days: null },
    { estimated_delivery_time: "2026-02-30" }, { estimated_delivery_time: "2026-10-24" },
  ]) {
    const api = loadPatch();
    assert.equal((await api.patch(body)).status, 400);
    assert.equal(api.updates.length, 0);
  }
});

test("接口根据数据库当前状态校验清关状态、开船时间和编辑权限", async () => {
  for (const existing of [
    { latest_track: "已开船" }, { sailing_time: null },
    { estimated_duration_days: null }, { warehouse_arrived_time: "2026-10-23" },
  ]) {
    const api = loadPatch(existing);
    assert.equal((await api.patch({ estimated_delivery_time: "2026-10-25" })).status, 400);
    assert.equal(api.updates.length, 0);
  }
  const api = loadPatch({}, false);
  assert.equal((await api.patch({ estimated_duration_days: 20 })).status, 400);
  assert.equal(api.updates.length, 0);
});

test("接口接受两天边界，并按同一请求中调整后的开船时间和时效校验", async () => {
  const api = loadPatch();
  assert.equal((await api.patch({ estimated_delivery_time: "2026-10-25" })).status, 200);
  assert.equal((await api.patch({ estimated_delivery_time: null })).status, 200);
  assert.equal((await api.patch({ estimated_duration_days: 30 })).status, 200);
  const changed = loadPatch();
  assert.equal((await changed.patch({
    sailing_time: "2026-10-10", estimated_duration_days: 20, estimated_delivery_time: "2026-10-25",
  })).status, 400);
  assert.equal(changed.updates.length, 0);
  assert.equal((await changed.patch({
    sailing_time: "2026-10-10", estimated_duration_days: 20, estimated_delivery_time: "2026-11-01",
  })).status, 200);
});
