import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { verifyLogisticsOperator } from "../rishenghui/_lib";

const PRODUCT_IMAGES_BUCKET = "product-images";

const TEMPLATE_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function POST() {
  try {
    await verifyLogisticsOperator();

    const adminClient = createSupabaseAdminClient();
    const { error } = await adminClient.storage.updateBucket(
      PRODUCT_IMAGES_BUCKET,
      {
        public: true,
        fileSizeLimit: 10485760,
        allowedMimeTypes: TEMPLATE_ALLOWED_MIME_TYPES,
      },
    );

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "发票模板存储配置更新失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
