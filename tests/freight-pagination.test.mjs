import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
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
const validOperator = { id: 'user', status: '启用', role: { menu_permissions: ['freights'] } };
function harness(respond, { session = { userId: 'user' }, operator = validOperator } = {}) {
  const calls = [];
  const saleasyCalls = [];
  const client = createClient('https://test.supabase.co', 'test-key', {
    auth: { persistSession: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input);
      calls.push(url);
      const { rows = [], total = Array.isArray(rows) ? rows.length : 1, status = 200 } =
        url.pathname.endsWith('/system_users') ? { rows: operator } : respond(url);
      const counted = new Headers(init.headers).get('prefer')?.includes('count=exact');
      return new Response(JSON.stringify(rows), { status, headers: {
        'content-type': 'application/json',
        'content-range': `0-${Math.max(0, rows.length - 1)}/${counted ? total : '*'}`,
      } });
    } },
  });
  const api = load('src/app/api/freights/route.ts', {
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'session' }) }) },
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/app-session': { APP_SESSION_COOKIE: 'session', verifySessionToken: () => session },
    '@/lib/supabase-admin': { createSupabaseAdminClient: () => client },
    '../shipments/_saleasy': {
      normalizeSaleasyBaseUrl: (value) => value,
      getRequiredText: (value) => value,
      loginSaleasy: async () => 'mock-token',
      requestSaleasyJson: async (params) => { saleasyCalls.push(params.body.searchKey); return []; },
      extractRows: (rows) => rows,
    },
  });
  return { calls, saleasyCalls, get: async (params = '') => {
    const response = await api.GET(new Request(`http://localhost/api/freights?${params}`));
    return { status: response.status, ...await response.json() };
  }, queries: () => calls.filter((url) => !url.pathname.endsWith('/system_users')) };
}

test('运费按页查询及数据库排序，无货件 ID 预加载', async () => {
  const h = harness((url) => ({ rows: [{ id: `row-${url.searchParams.get('offset')}`, created_at: '2026-10-01', shipment: { created_at: '2026-11-01' } }], total: 1234 }));
  const first = await h.get();
  const second = await h.get('current=2&pageSize=100&sortField=created_at&sortOrder=ascend&product_name=产品');
  const queries = h.queries();
  assert.equal(queries.length, 2);
  assert.equal(queries[0].pathname, '/rest/v1/freight_records');
  assert.equal(queries[0].searchParams.get('limit'), '50');
  assert.equal(queries[1].searchParams.get('offset'), '100');
  assert.equal(queries[1].searchParams.get('limit'), '100');
  assert.equal(queries[1].searchParams.get('order'), 'shipment(created_at).asc.nullslast,id.asc');
  assert.equal(queries[1].searchParams.get('shipment.status'), 'eq.有效');
  assert.equal(queries[1].searchParams.get('shipment.product_name'), 'in.(产品)');
  assert.equal(second.total, 1234);
  assert.equal(first.data[0].created_at, '2026-11-01');
  assert.notEqual(first.data[0].id, second.data[0].id);
  assert.equal('summary' in first, false);
});

test('合计与列表使用同一组筛选，合计跨过 1000 条且只查询必要字段', async () => {
  const h = harness((url) => {
    const q = url.searchParams;
    if (q.get('select').startsWith('id,')) return { rows: [], total: 1001 };
    return { rows: Array.from({ length: q.get('offset') === '0' ? 1000 : 1 }, () => ({ volume: 0.1, total_fee: 2, bill_amount: 3 })), total: 1001 };
  });
  const filters = 'shipment_no=S&tracking_no=T&order_store=店铺&product_name=产品&logistics_provider=物流&created_at=2026-01-01&created_at=2026-12-31&bill_issued=是&freight_paid_status=否';
  await h.get(filters);
  const result = await h.get(`${filters}&mode=summary`);
  assert.equal(result.status, 200);
  assert.deepEqual(result.summary, { volume: 100.1, total_fee: 2002, bill_amount: 3003 });
  const queries = h.queries();
  assert.equal(queries.length, 3);
  assert.equal(queries[2].searchParams.get('offset'), '1000');
  assert.equal(queries[1].searchParams.get('select'), 'volume,total_fee,bill_amount,shipment:shipment_records!inner(id)');
  for (const field of ['shipment.status', 'shipment.shipment_no', 'shipment.tracking_no', 'shipment.product_name', 'shipment.order_store', 'shipment.logistics_provider', 'shipment.created_at', 'bill_amount', 'or']) {
    assert.deepEqual(queries[0].searchParams.getAll(field), queries[1].searchParams.getAll(field), field);
  }
  assert.equal(queries[1].searchParams.get('or'), '(freight_paid_status.is.null,freight_paid_status.eq.否)');
  assert.deepEqual(h.saleasyCalls, []);
});

test('合计恰好 1000 条时不会多请求一个越界页，空合计为零', async () => {
  const h = harness(() => ({ rows: Array.from({ length: 1000 }, () => ({ volume: null, total_fee: 1, bill_amount: 0 })), total: 1000 }));
  assert.equal((await h.get('mode=summary')).summary.total_fee, 1000);
  assert.equal(h.queries().length, 1);
  assert.deepEqual((await harness(() => ({ rows: [] })).get('mode=summary')).summary, { volume: 0, total_fee: 0, bill_amount: 0 });
});

test('末页越界恢复总数，缺少备注列时保持分页和筛选', async () => {
  const h = harness((url) => {
    const q = url.searchParams;
    if (q.get('select').includes('extra_fee_remark')) return { status: 400, rows: { code: '42703', message: 'column extra_fee_remark does not exist' } };
    if (q.get('offset') === '450') return { status: 416, rows: { code: 'PGRST103' } };
    return { rows: [{ id: 'first' }], total: 101 };
  });
  const result = await h.get('current=10&order_store=A&bill_issued=否&freight_paid_status=是');
  assert.equal(result.status, 200);
  assert.equal(result.total, 101);
  assert.deepEqual(result.data, []);
  const queries = h.queries();
  assert.equal(queries.length, 3);
  assert.equal(queries[1].searchParams.get('offset'), '450');
  assert.equal(queries[2].searchParams.get('limit'), '1');
  for (const url of queries) {
    assert.equal(url.searchParams.get('shipment.order_store'), 'in.(A)');
    assert.equal(url.searchParams.get('bill_amount'), 'is.null');
    assert.equal(url.searchParams.get('freight_paid_status'), 'eq.是');
    assert.equal(url.searchParams.get('order'), 'shipment(created_at).desc.nullslast,id.asc');
  }
});

test('筛选选项远程搜索限量查询；店铺使用已有聚合视图；拒绝任意字段', async () => {
  const h = harness((url) => url.pathname.endsWith('/shipment_track_filter_options')
    ? { rows: { order_stores: ['ABC', 'XYZ'] } }
    : { rows: [{ shipment_no: 'ABC' }, { shipment_no: 'ABC' }] });
  assert.deepEqual((await h.get('mode=options&field=shipment_no&keyword=ABC')).options, [{ label: 'ABC', value: 'ABC' }]);
  assert.equal(h.queries()[0].searchParams.get('limit'), '50');
  assert.equal(h.queries()[0].searchParams.get('shipment_no'), 'not.is.null');
  assert.deepEqual(h.queries()[0].searchParams.getAll('shipment_no'), ['not.is.null', 'ilike.%ABC%']);
  assert.deepEqual((await h.get('mode=options&field=order_store&keyword=abc')).options, [{ label: 'ABC', value: 'ABC' }]);
  assert.equal(h.queries()[1].pathname, '/rest/v1/shipment_track_filter_options');
  assert.equal((await h.get('mode=options&field=password')).status, 400);
  assert.equal(h.queries().length, 2);
});

test('所有读取模式都校验登录、启用状态和运费权限', async () => {
  for (const options of [{ session: null }, { operator: { ...validOperator, status: '停用' } }, { operator: { ...validOperator, role: { menu_permissions: [] } } }]) {
    for (const mode of ['', 'mode=summary', 'mode=options&field=shipment_no']) {
      const h = harness(() => { throw new Error('Unauthorized data read'); }, options);
      assert.equal((await h.get(mode)).status, 400);
      assert.equal(h.queries().length, 0);
    }
  }
});

test('赛易信息只补充当前页，合计不调用物流系统', async () => {
  const h = harness((url) => url.pathname.endsWith('/logistics_providers')
    ? { rows: { system_url: 'https://example.com', username: 'test', password: 'test' } }
    : { rows: [{ id: 'page-2', shipment: { shipment_no: 'S-51', logistics_provider: '赛易' } }], total: 101 });
  assert.equal((await h.get('current=2&shipment_no=S-51')).status, 200);
  assert.deepEqual(h.saleasyCalls, ['S-51']);
  assert.equal(h.queries()[0].searchParams.get('offset'), '50');
});

test('浏览器请求发送分页排序参数；合计独立且保留相同筛选；错误可见', async (t) => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input, 'http://localhost');
    urls.push(url);
    return Response.json({ data: [], total: 1234, summary: { volume: 1, total_fee: 2, bill_amount: 3 } });
  });
  const api = load('src/app/freights/_lib/freights-request.ts');
  const params = { current: 3, pageSize: 999, order_store: ['A'], bill_issued: '是' };
  assert.equal((await api.requestFreightRecords(params, { created_at: 'ascend' })).total, 1234);
  await api.requestFreightSummary(params);
  assert.equal(urls[0].searchParams.get('current'), '3');
  assert.equal(urls[0].searchParams.get('pageSize'), '100');
  assert.equal(urls[0].searchParams.get('sortOrder'), 'ascend');
  assert.equal(urls[1].searchParams.has('current'), false);
  assert.equal(urls[1].searchParams.get('mode'), 'summary');
  for (const field of ['order_store', 'bill_issued']) assert.deepEqual(urls[0].searchParams.getAll(field), urls[1].searchParams.getAll(field));
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: '读取失败' }, { status: 400 }));
  await assert.rejects(api.requestFreightRecords({}), /读取失败/);
  await assert.rejects(api.requestFreightSummary({}), /读取失败/);
});
