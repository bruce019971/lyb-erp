"use client";

import { FileExcelOutlined } from "@ant-design/icons";
import { App, Button, Modal, Typography } from "antd";
import { useEffect, useState } from "react";

import type { ShipmentRecord } from "../_lib/shipments";

type ShipmentRishenghuiOrderModalProps = {
  open: boolean;
  record?: ShipmentRecord;
  providerName?: string;
  onClose: () => void;
  onGenerateInvoice: (values: {
    record: ShipmentRecord;
  }) => Promise<{
    record?: ShipmentRecord;
    fileUrl: string;
    fileName: string;
  }>;
  accessToken?: string;
  onSubmitOrder: (values: {
    shipmentId: string;
    fileUrl?: string;
    fileName?: string;
    accessToken?: string;
  }) => Promise<{
    record?: ShipmentRecord;
    packno?: string;
    taskId?: string;
  }>;
  onTokenRequired: () => void;
};

function getInvoiceFileFromRecord(record?: ShipmentRecord) {
  const fileUrl = record?.order_invoice_url?.trim();
  if (!fileUrl || !record) return null;

  return {
    fileUrl,
    fileName: `${getInvoiceFilePrefix(record)}_${
      record.shipment_no?.trim() || record.id
    }_发票.xlsx`,
  };
}

function getInvoiceFilePrefix(record?: ShipmentRecord) {
  return record?.logistics_provider?.trim() === "通途" ? "TT" : "RSH";
}

async function downloadFile(fileUrl: string, fileName: string) {
  const response = await fetch(fileUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("下单发票文件读取失败");
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export default function ShipmentRishenghuiOrderModal({
  open,
  record,
  providerName,
  onClose,
  onGenerateInvoice,
  accessToken,
  onSubmitOrder,
  onTokenRequired,
}: ShipmentRishenghuiOrderModalProps) {
  const { message } = App.useApp();
  const [invoiceGenerating, setInvoiceGenerating] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState<{
    fileUrl: string;
    fileName: string;
  } | null>(() => getInvoiceFileFromRecord(record));
  const [invoiceDownloading, setInvoiceDownloading] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const normalizedProviderName =
    providerName?.trim() || record?.logistics_provider?.trim() || "";
  const canSubmitOrder =
    (normalizedProviderName === "日升辉" || normalizedProviderName === "通途") &&
    Boolean(invoiceFile);

  function resetState() {
    setInvoiceGenerating(false);
    setInvoiceDownloading(false);
    setOrderSubmitting(false);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  async function handleGenerateInvoice() {
    if (!record?.id) {
      message.error("缺少货件ID");
      return;
    }

    try {
      setInvoiceGenerating(true);
      const result = await onGenerateInvoice({
        record,
      });
      setInvoiceFile({
        fileUrl: result.fileUrl,
        fileName: result.fileName,
      });
      message.success(`${record.shipment_no?.trim() || record.id}发票生成成功`);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "下单发票生成失败",
      );
    } finally {
      setInvoiceGenerating(false);
    }
  }

  async function handleDownloadInvoice() {
    if (!invoiceFile || invoiceDownloading) return;

    try {
      setInvoiceDownloading(true);
      await downloadFile(invoiceFile.fileUrl, invoiceFile.fileName);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "下单发票下载失败",
      );
    } finally {
      setInvoiceDownloading(false);
    }
  }

  async function handleSubmitOrder() {
    if (!invoiceFile) {
      message.error("请先生成发票");
      return;
    }

    if (!record?.id) {
      message.error("缺少货件ID");
      return;
    }

    const isRishenghui = normalizedProviderName === "日升辉";
    const isTongtu = normalizedProviderName === "通途";
    if (!isRishenghui && !isTongtu) return;

    const token = accessToken?.trim();
    if (isRishenghui && !token) {
      Modal.warning({
        title: "请先获取日升辉Token",
        content: "当前没有可用的日升辉Token，请先在列表右上角获取Token。",
        okText: "去获取",
        onOk: onTokenRequired,
      });
      return;
    }

    try {
      setOrderSubmitting(true);

      const result = await onSubmitOrder({
        shipmentId: record.id,
        fileUrl: invoiceFile.fileUrl,
        fileName: invoiceFile.fileName,
        accessToken: token || undefined,
      });
      message.success(
        result.packno
          ? `${record.shipment_no?.trim() || record.id}下单成功`
          : result.taskId
            ? `${record.shipment_no?.trim() || record.id}导入任务已提交`
            : `${record.shipment_no?.trim() || record.id}下单成功`,
      );
      handleClose();
    } catch (error) {
      Modal.error({
        title: "物流下单失败",
        content: getErrorMessage(error, "下单失败"),
        okText: "知道了",
      });
    } finally {
      setOrderSubmitting(false);
    }
  }

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => {
      setInvoiceFile(getInvoiceFileFromRecord(record));
      setInvoiceDownloading(false);
      setOrderSubmitting(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open, record]);

  return (
    <Modal
      title={null}
      open={open}
      width={620}
      destroyOnHidden
      maskClosable={false}
      onCancel={handleClose}
      footer={
        normalizedProviderName === "日升辉" || normalizedProviderName === "通途" ? (
          <div className="flex justify-end">
            <Button
              type="primary"
              disabled={!canSubmitOrder}
              loading={orderSubmitting}
              onClick={() => void handleSubmitOrder()}
            >
              下单
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button onClick={handleClose}>关闭</Button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <label className="w-16 shrink-0 text-sm text-slate-700">货件号</label>
          <Typography.Text>{record?.shipment_no?.trim() || "-"}</Typography.Text>
        </div>
        <div className="flex items-center gap-3">
          <label className="w-16 shrink-0 text-sm text-slate-700">物流商</label>
          <Typography.Text>{normalizedProviderName || "-"}</Typography.Text>
        </div>
        {normalizedProviderName === "日升辉" ? (
          <div className="flex items-center gap-3">
            <label className="w-16 shrink-0 text-sm text-slate-700">Token</label>
            <Typography.Text type={accessToken ? "success" : "danger"}>
              {accessToken ? "已获取" : "未获取"}
            </Typography.Text>
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <Button
            icon={<FileExcelOutlined />}
            loading={invoiceGenerating}
            onClick={() => void handleGenerateInvoice()}
          >
            生成发票
          </Button>
          {invoiceFile ? (
            <Typography.Link
              className="max-w-[330px] truncate"
              disabled={invoiceDownloading}
              onClick={() => void handleDownloadInvoice()}
            >
              {invoiceDownloading ? "下载中..." : invoiceFile.fileName}
            </Typography.Link>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
