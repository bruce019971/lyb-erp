import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
function load(path, mocks) {
  const filename = resolve(path);
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  const exports = {};
  new Function('require', 'exports', outputText)((name) => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`, mocks);
    if (name.startsWith('.')) return load(resolve(dirname(filename), `${name}.ts`), mocks);
    return require(name);
  }, exports);
  return exports;
}
function harness(file, respond) {
  const calls = [];
  const client = createClient('https://test.supabase.co', 'test-key', {
    auth: { persistSession: false },
    global: { fetch: async (input) => {
      const url = new URL(input);
      calls.push(url);
      const { rows = [], total = rows.length, status = 200 } = respond(url);
      return new Response(JSON.stringify(rows), { status, headers: {
        'content-type': 'application/json', 'content-range': `0-${Math.max(0, rows.length - 1)}/${total}`,
      } });
    } },
  });
  return { calls, api: load(file, { '@/lib/supabase': { supabase: client }, antd: { message: { error() {} } } }) };
}
const shipments = 'src/app/shipments/_lib/shipments-request.ts';
const tracks = 'src/app/shipment-tracks/_lib/shipment-tracks-request.ts';

test('货件仅取当前页、保留全局总数，换标送仓时间在数据库排序', async () => {
  const { api, calls } = harness(shipments, (url) => ({ rows: [{
    id: `row-${url.searchParams.get('offset')}`, product_name: null, estimated_delivery_time: '2026-12-01',
    relabel_records: [{ delivery_time: '2026-12-02' }, { delivery_time: '2026-12-02' }],
  }], total: 1234 }));
  const first = await api.requestShipmentRecords({}, {});
  const second = await api.requestShipmentRecords({ current: 2, pageSize: 50, is_relabel: '是' }, { appointment_time: 'ascend' });
  assert.equal(calls.length, 2); // No all-relabel or all-shipment request.
  assert.equal(calls[0].searchParams.get('offset'), '0');
  assert.equal(calls[0].searchParams.get('limit'), '50');
  assert.equal(calls[1].searchParams.get('offset'), '50');
  assert.equal(calls[1].searchParams.get('has_relabel'), 'eq.true');
  assert.equal(calls[1].searchParams.get('order'), 'effective_appointment_time.asc.nullslast,id.asc');
  assert.equal(second.total, 1234);
  assert.notEqual(first.data[0].id, second.data[0].id);
  assert.equal(second.data[0].estimated_delivery_time, '2026-12-01');
  assert.deepEqual(second.data[0].relabel_delivery_times, ['2026-12-02']);
});

test('货件合计和列表应用相同的表单、列筛选，合计覆盖全部数据', async () => {
  const { api, calls } = harness(shipments, (url) => ({ rows: url.searchParams.get('select') === '*' ? [] : [{ box_count: 2, total_qty: 100, goods_value: 50 }] }));
  const params = { is_relabel: '否', order_store: ['店铺'], instruction_submitted: '是', created_at: ['2026-01-01','2026-12-31'] };
  const filters = { shipment_no: ['ABC DEF'], appointment_time: ['2026-11-01|2026-12-01'] };
  await api.requestShipmentRecords(params, {}, filters);
  const summary = await api.requestShipmentSummary(params, filters);
  for (const field of ['has_relabel', 'order_store', 'instruction_submitted', 'or', 'created_at', 'appointment_time']) {
    assert.deepEqual(calls[0].searchParams.getAll(field), calls[1].searchParams.getAll(field), field);
  }
  assert.equal(summary.totalQty, 100);
  assert.equal(summary.goodsValue, 50);
});

test('轨迹关联筛选与超时筛选在分页前执行，不预取可能截断的货件 ID', async () => {
  const { api, calls } = harness(tracks, () => ({ rows: [{ id: 'track-1', sailing_time: '2026-01-01', warehouse_arrived_time: '2026-03-01', shipment: { total_qty: 200 } }], total: 1501 }));
  const result = await api.requestShipmentTrackRecords({ current: 3, pageSize: 100, product_name: ['产品'], show_overdue_shipments: true, warehouse_arrived: '是' });
  assert.equal(calls.length, 1);
  const q = calls[0].searchParams;
  assert.equal(q.get('offset'), '200');
  assert.equal(q.get('limit'), '100');
  assert.equal(q.get('duration_days'), 'gt.50');
  assert.equal(q.get('shipment.product_name'), 'in.(产品)');
  assert.equal(q.get('shipment.or'), '(delivery_status.is.null,delivery_status.neq.是)');
  assert.equal(q.get('order'), 'created_at.desc.nullslast,id.asc');
  assert.equal(result.total, 1501);
});

test('轨迹总数包含全部匹配数据，空页不伪造总数', async () => {
  const { api, calls } = harness(tracks, () => ({ rows: [], total: 101 }));
  const result = await api.requestShipmentTrackRecords({ current: 10, show_delivered_shipments: true });
  assert.deepEqual(result.data, []);
  assert.equal(result.total, 101);
  assert.equal(calls[0].searchParams.has('shipment.or'), false);
});

test('轨迹合计使用同一关联筛选，并显式报告数据库错误', async () => {
  const { api, calls } = harness(tracks, () => ({ rows: [{ shipment: { total_qty: 20 } }, { shipment: { total_qty: 30 } }] }));
  const summary = await api.requestShipmentTrackSummary({ order_store: ['A'], show_overdue_shipments: true });
  assert.equal(summary.totalQty, 50);
  assert.equal(calls[0].searchParams.get('shipment.order_store'), 'in.(A)');
  assert.equal(calls[0].searchParams.get('duration_days'), 'gt.50');
  const broken = harness(tracks, () => ({ status: 400, rows: { message: 'bad query' } }));
  await assert.rejects(broken.api.requestShipmentTrackSummary({}));
});

test('分页参数有默认值及边界，不能恢复为一次性读取全表', () => {
  const { getPageRange } = load('src/lib/table-pagination.ts', {});
  assert.deepEqual(getPageRange({}), { current: 1, pageSize: 50, from: 0, to: 49 });
  assert.deepEqual(getPageRange({ current: -2, pageSize: 10000 }), { current: 1, pageSize: 100, from: 0, to: 99 });
  assert.equal(getPageRange({ current: NaN }).from, 0);
});

test('删除导致末页越界时，恢复准确总数供界面回退页码', async () => {
  for (const [file, method] of [[shipments, 'requestShipmentRecords'], [tracks, 'requestShipmentTrackRecords']]) {
    const { api, calls } = harness(file, (url) => url.searchParams.get('offset') === '450'
      ? { status: 416, rows: { code: 'PGRST103', message: 'Requested range not satisfiable' }, total: 101 }
      : { rows: [{ id: 'first' }], total: 101 });
    const result = await api[method]({ current: 10 }, {});
    assert.equal(result.success, true);
    assert.equal(result.total, 101);
    assert.deepEqual(result.data, []);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].searchParams.get('offset'), '0');
    assert.equal(calls[1].searchParams.get('limit'), '1');
  }
});

test('轨迹筛选选项只查询数据库聚合结果', async () => {
  const options = { order_stores: ['A'], product_names: ['产品'], logistics_providers: ['物流商'] };
  const { api, calls } = harness(tracks, () => ({ rows: options }));
  assert.deepEqual(await api.requestShipmentTrackFilterOptions(), options);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].pathname, '/rest/v1/shipment_track_filter_options');
});
