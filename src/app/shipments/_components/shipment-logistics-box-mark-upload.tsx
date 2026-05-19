"use client";

import { UploadOutlined } from "@ant-design/icons";
import { App, Button, Upload } from "antd";
import type { UploadFile, UploadProps } from "antd";

import { getShipmentLogisticsBoxMarkFileName } from "../_lib/carton-label";
import { uploadShipmentLogisticsBoxMark } from "../_lib/shipments-request";
import type { StoreOption } from "../../stores/_lib/stores";

type ShipmentLogisticsBoxMarkRecord = {
  id: string;
  order_store?: string | null;
  shipment_no?: string | null;
  product_name?: string | null;
  box_count?: number | null;
};

type ShipmentLogisticsBoxMarkUploadProps = {
  fileUrl?: string | null;
  record: ShipmentLogisticsBoxMarkRecord;
  storeOptions: StoreOption[];
  uploading: boolean;
  disabled?: boolean;
  onUploadingChange: (uploading: boolean) => void;
  onUrlChange: (url: string | null) => void;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

function getDisplayFileName(
  record: ShipmentLogisticsBoxMarkRecord,
  storeOptions: StoreOption[],
) {
  return `${getShipmentLogisticsBoxMarkFileName(
    record,
    storeOptions,
  )}.pdf`;
}

async function downloadFile(url: string, filename: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("物流箱唛文件读取失败");
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

export default function ShipmentLogisticsBoxMarkUpload({
  fileUrl,
  record,
  storeOptions,
  uploading,
  disabled,
  onUploadingChange,
  onUrlChange,
}: ShipmentLogisticsBoxMarkUploadProps) {
  const { message } = App.useApp();
  const normalizedUrl = fileUrl?.trim() || undefined;
  const displayFileName = getDisplayFileName(record, storeOptions);
  const fileList: UploadFile[] = normalizedUrl
    ? [
        {
          uid: `${record.id || "new"}-logistics-box-mark`,
          name: displayFileName,
          status: "done",
          url: normalizedUrl,
        },
      ]
    : [];

  const uploadProps: UploadProps = {
    accept: ".pdf,application/pdf",
    maxCount: 1,
    fileList,
    disabled,
    showUploadList: true,
    beforeUpload: (file) => {
      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");

      if (!isPdf) {
        message.error("请上传 PDF 格式的物流箱唛");
        return Upload.LIST_IGNORE;
      }

      return true;
    },
    customRequest: async ({ file, onError, onSuccess }) => {
      try {
        onUploadingChange(true);
        const nextUrl = await uploadShipmentLogisticsBoxMark(file as File);
        onUrlChange(nextUrl);
        onSuccess?.({ url: nextUrl });
      } catch (error) {
        const description = getErrorMessage(error, "请检查文件存储权限");
        message.error(`物流箱唛上传失败：${description}`);
        onError?.(error as Error);
      } finally {
        onUploadingChange(false);
      }
    },
    onRemove: () => {
      onUrlChange(null);
      return true;
    },
    onPreview: async () => {
      if (!normalizedUrl) return;

      try {
        await downloadFile(normalizedUrl, displayFileName);
      } catch (error) {
        const description = getErrorMessage(error, "请检查文件地址是否有效");
        message.error(`物流箱唛下载失败：${description}`);
      }
    },
  };

  return (
    <Upload {...uploadProps}>
      <Button icon={<UploadOutlined />} loading={uploading} disabled={disabled}>
        上传
      </Button>
    </Upload>
  );
}
