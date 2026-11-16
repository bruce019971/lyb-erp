import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  generateShipmentLabels,
  getShipmentLabelQrPayload,
  parseShipmentLabelRequest,
  ShipmentLabelInputError,
} from "../src/lib/shipment-label.ts";

function request(isNew = false) {
  return {
    status: { isId: true, isNew },
    data: {
      id: isNew ? "82200341" : "81889235", nb: "5",
      shopId: isNew ? "3639843221" : "3389953312",
      shopName: isNew ? "" : "MSXLSHOPMXF",
      warehouseNumber: isNew ? "MXRC03" : "",
      warehouseName: isNew ? "Centro logístico Danhos Cuautitlán - MXRC03" : "",
    },
  };
}

test("historical QR payloads remain compatible, including carton number", () => {
  // Independently decoded from historical CBT and local PDFs.
  assert.equal(getShipmentLabelQrPayload("81889235", 1, false),
    '{"id": "81889235/1", "operation": "fbm", "type":"inbound","source":"seller"}');
  assert.equal(getShipmentLabelQrPayload("82200341", 2, true),
    '{"id":"82200341/2","reference_id":"82200341/2","t":"inb","ops_data":{"source":"seller","container_type":"box"}}');
  assert.equal(JSON.parse(getShipmentLabelQrPayload("00001234", 10, false)).id, "00001234/10");
});

test("one PDF page per carton, with historical page sizes and no remote calls", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("The generator must stay offline"); };
  try {
    for (const local of [false, true]) {
      const body = request(local);
      body.data.nb = local ? "10" : "2";
      const result = await generateShipmentLabels(body);
      assert.equal(result.contentType, "application/pdf");
      assert.equal(Buffer.from(result.buffer).subarray(0, 5).toString(), "%PDF-");
      const pdf = await PDFDocument.load(result.buffer);
      assert.equal(pdf.getPageCount(), Number(body.data.nb));
      for (const page of pdf.getPages()) {
        assert.equal(page.getWidth(), 283.5);
        assert.equal(page.getHeight(), local ? 425.25 : 283.5);
      }
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("accepts current string inputs and safe numeric inputs", () => {
  const body = request(true);
  body.data.id = "00001234";
  body.data.nb = 1;
  body.data.shopId = "#3639843221";
  const result = parseShipmentLabelRequest(body);
  assert.equal(result.shipmentNo, "00001234");
  assert.equal(result.shopId, "3639843221");
  assert.equal(result.boxCount, 1);
  body.data.nb = 500;
  assert.equal(parseShipmentLabelRequest(body).boxCount, 500);
});

test("rejects invalid counts before generating any PDF", () => {
  for (const count of [0, -1, 1.5, 501, "1e2", "1.0", "01", "", "5 boxes", null, true, [], {}, Infinity]) {
    const body = request(); body.data.nb = count;
    assert.throws(() => parseShipmentLabelRequest(body), ShipmentLabelInputError, String(count));
  }
});

test("validates modes, IDs and printable data instead of silently changing labels", () => {
  for (const body of [null, [], {}, { status: {}, data: {} }]) {
    assert.throws(() => parseShipmentLabelRequest(body), ShipmentLabelInputError);
  }
  const mutations = [
    b => { b.status.isId = false; },
    b => { b.status.isNew = "false"; },
    b => { b.data.id = "12/3"; },
    b => { b.data.shopId = Number.MAX_SAFE_INTEGER + 1; },
    b => { b.data.shopName = ""; },
    b => { b.data.shopName = "shop\nother"; },
    b => { b.data.shopName = "店铺"; },
  ];
  for (const mutate of mutations) {
    const body = request(); mutate(body);
    assert.throws(() => parseShipmentLabelRequest(body), ShipmentLabelInputError);
  }
  const local = request(true); local.data.warehouseNumber = "";
  assert.throws(() => parseShipmentLabelRequest(local), ShipmentLabelInputError);
});
