import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const { outputText } = ts.transpileModule(readFileSync(new URL("./route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});

function setup(options = {}) {
  const state = {
    relabels: [{ id: "r1", original_shipment_no: " S001 " }],
    shipments: [
      { id: "s1", shipment_no: "S001", status: "有效", appointment_time: "2026-11-01", delivery_status: "是" },
      { id: "s2", shipment_no: "S002", status: "有效", appointment_time: "2026-11-02", delivery_status: "否" },
      { id: "s3", shipment_no: "S001", status: "无效", appointment_time: "2026-11-03", delivery_status: "否" },
    ],
  };
  const writes = [];
  const client = { from(table) {
    const filters = [];
    let action = "read";
    let values;
    let single = false;
    return {
      select() { return this; },
      eq(key, value) { filters.push((row) => row[key] === value); return this; },
      single() { single = true; return this; },
      maybeSingle() { single = true; return this; },
      update(payload) { action = "update"; values = payload; return this; },
      delete() { action = "delete"; return this; },
      then(resolve, reject) {
        if (table === "system_users") return Promise.resolve({ data: {
          id: "u1", status: options.disabled ? "停用" : "启用",
          role: { menu_permissions: options.denied ? [] : ["relabels"] },
        }, error: null }).then(resolve, reject);
        const rows = table === "relabel_records" ? state.relabels : state.shipments;
        const matches = rows.filter((row) => filters.every((filter) => filter(row)));
        if (action !== "read") writes.push([table, action]);
        if ((action === "update" && options.failUpdate) || (action === "delete" && options.failDelete)) {
          return Promise.resolve({ data: null, error: { message: "模拟数据库错误" } }).then(resolve, reject);
        }
        if (action === "update") matches.forEach((row) => Object.assign(row, values));
        if (action === "delete") state.relabels = state.relabels.filter((row) => !matches.includes(row));
        return Promise.resolve({ data: single ? matches[0] ?? null : matches, error: null }).then(resolve, reject);
      },
    };
  } };
  const mocks = {
    "next/headers": { cookies: async () => ({ get: () => ({ value: "session" }) }) },
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/app-session": { APP_SESSION_COOKIE: "session", verifySessionToken: () => options.loggedOut ? null : { userId: "u1" } },
    "@/lib/supabase-admin": { createSupabaseAdminClient: () => client },
  };
  const exports = {};
  new Function("require", "exports", outputText)((name) => mocks[name], exports);
  return { state, writes, remove: (id = "r1") => exports.DELETE(
    new Request(`http://localhost/api/relabels/${id}`, { method: "DELETE" }),
    { params: Promise.resolve({ id }) },
  ) };
}

test("删除换标记录并清空对应有效原货件的送仓时间，保留其他字段及其他货件", async () => {
  const { state, remove } = setup();
  assert.equal((await remove()).status, 200);
  assert.equal(state.relabels.length, 0);
  assert.equal(state.shipments[0].appointment_time, null);
  assert.equal(state.shipments[0].delivery_status, "是");
  assert.equal(state.shipments[1].appointment_time, "2026-11-02");
  assert.equal(state.shipments[2].appointment_time, "2026-11-03");
});

test("清空送仓时间失败时保留换标记录，恢复后可重试", async () => {
  const options = { failUpdate: true };
  const { state, writes, remove } = setup(options);
  const response = await remove();
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /换标记录尚未删除/);
  assert.equal(state.relabels.length, 1);
  assert.equal(state.shipments[0].appointment_time, "2026-11-01");
  assert.ok(writes.every(([, action]) => action !== "delete"));
  options.failUpdate = false;
  assert.equal((await remove()).status, 200);
  assert.equal(state.shipments[0].appointment_time, null);
});

test("删除失败明确提示已清空送仓时间，重试可以完成删除", async () => {
  const options = { failDelete: true };
  const { state, remove } = setup(options);
  const response = await remove();
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /送仓时间已清空.*删除失败/);
  assert.equal(state.relabels.length, 1);
  options.failDelete = false;
  assert.equal((await remove()).status, 200);
  assert.equal(state.relabels.length, 0);
});

test("无关联货件时仍可删除，记录不存在时不修改任何货件", async () => {
  const fixture = setup();
  fixture.state.shipments = [];
  assert.equal((await fixture.remove()).status, 200);
  const missing = setup();
  assert.equal((await missing.remove("missing")).status, 404);
  assert.equal(missing.writes.length, 0);
});

test("未登录、停用或无换标权限时不能删除或清空送仓时间", async () => {
  for (const options of [{ loggedOut: true }, { disabled: true }, { denied: true }]) {
    const fixture = setup(options);
    assert.equal((await fixture.remove()).status, 400);
    assert.equal(fixture.writes.length, 0);
  }
});
