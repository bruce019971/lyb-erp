"use client";

import { UploadOutlined } from "@ant-design/icons";
import { App, Button, Upload } from "antd";
import type { UploadFile, UploadProps } from "antd";

import { uploadLogisticsInvoiceTemplate } from "../_lib/logistics-request";

type LogisticsInvoiceTemplateUploadProps = {
  fileUrl?: string | null;
  providerName?: string | null;
  uploading: boolean;
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

function getInvoiceTemplateName(providerName?: string | null) {
  return `${providerName?.trim() || "物流商"}下单发票模板`;
}

export default function LogisticsInvoiceTemplateUpload({
  fileUrl,
  providerName,
  uploading,
  onUploadingChange,
  onUrlChange,
}: LogisticsInvoiceTemplateUploadProps) {
  const { message } = App.useApp();
  const normalizedUrl = fileUrl?.trim() || undefined;
  const displayName = getInvoiceTemplateName(providerName);
  const fileList: UploadFile[] = normalizedUrl
    ? [
        {
          uid: "invoice-template",
          name: displayName,
          status: "done",
          url: normalizedUrl,
        },
      ]
    : [];

  const uploadProps: UploadProps = {
    accept: ".pdf,.xls,.xlsx,.doc,.docx",
    maxCount: 1,
    fileList,
    showUploadList: true,
    customRequest: async ({ file, onError, onSuccess }) => {
      try {
        onUploadingChange(true);
        const nextUrl = await uploadLogisticsInvoiceTemplate(file as File);
        onUrlChange(nextUrl);
        onSuccess?.({ url: nextUrl });
      } catch (error) {
        const description = getErrorMessage(error, "请检查文件存储权限");
        message.error(`发票模板上传失败：${description}`);
        onError?.(error as Error);
      } finally {
        onUploadingChange(false);
      }
    },
    onRemove: () => {
      onUrlChange(null);
      return true;
    },
  };

  return (
    <Upload {...uploadProps}>
      <Button icon={<UploadOutlined />} loading={uploading}>
        上传
      </Button>
    </Upload>
  );
}
