import { NextResponse } from "next/server";

import { verifyDamageOperator } from "../_lib/operator";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const adminClient = await verifyDamageOperator();
    const { id } = await context.params;

    if (!id?.trim()) {
      throw new Error("缺少货损记录ID");
    }

    const { data, error } = await adminClient
      .from("damage_records")
      .delete()
      .eq("id", id.trim())
      .select("id")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("货损记录不存在或已删除");

    return NextResponse.json({ data: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "货损记录删除失败，请稍后重试";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
