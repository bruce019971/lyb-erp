import { generateShipmentLabels, ShipmentLabelInputError } from "@/lib/shipment-label";
import { ShipmentAccessError, verifyShipmentOperator } from "@/lib/shipment-permissions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await verifyShipmentOperator();
    const result = await generateShipmentLabels(await request.json());
    return new Response(Uint8Array.from(result.buffer).buffer, {
      headers: {
        "content-type": result.contentType,
        "content-disposition": `attachment; filename="${result.fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const status = error instanceof ShipmentAccessError ? error.status
      : error instanceof ShipmentLabelInputError || error instanceof SyntaxError ? 400 : 500;
    if (status === 500) console.error("[download-shipment-label] generation failed", error);
    return Response.json({
      error: status === 500 ? "外箱标签生成失败，请稍后重试"
        : error instanceof Error ? error.message : "请求参数错误",
    }, { status });
  }
}
