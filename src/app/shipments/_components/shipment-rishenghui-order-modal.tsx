"use client";

import { FileExcelOutlined, ReloadOutlined } from "@ant-design/icons";
import { App, Button, Input, Modal, Space, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ShipmentRecord } from "../_lib/shipments";

type ShipmentRishenghuiOrderModalProps = {
  open: boolean;
  record?: ShipmentRecord;
  onClose: () => void;
  onGenerateInvoice: (values: {
    record: ShipmentRecord;
  }) => Promise<{
    record?: ShipmentRecord;
    fileUrl: string;
    fileName: string;
  }>;
  onGetAccessToken: (values: {
    code: string;
    uuid: string;
  }) => Promise<string>;
  onSubmitOrder: (values: {
    shipmentId: string;
    fileUrl: string;
    fileName: string;
    accessToken: string;
  }) => Promise<{
    record?: ShipmentRecord;
    packno: string;
  }>;
  onSubmitSuccess: (record?: ShipmentRecord) => void;
};

type AuthCodeResponse = {
  img?: string;
  uuid?: string;
  error?: string;
};

type ValidCodeResponse = {
  valid?: boolean;
  error?: string;
};

type ValidCodeStatus = "idle" | "validating" | "valid" | "invalid";

function getInvoiceFileFromRecord(record?: ShipmentRecord) {
  const fileUrl = record?.order_invoice_url?.trim();
  if (!fileUrl || !record) return null;

  return {
    fileUrl,
    fileName: `RSH_${record.shipment_no?.trim() || record.id}_发票.xlsx`,
  };
}

async function downloadFile(fileUrl: string, fileName: string) {
  const response = await fetch(fileUrl);
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

export default function ShipmentRishenghuiOrderModal({
  open,
  record,
  onClose,
  onGenerateInvoice,
  onGetAccessToken,
  onSubmitOrder,
  onSubmitSuccess,
}: ShipmentRishenghuiOrderModalProps) {
  const { message } = App.useApp();
  const [authCodeImg, setAuthCodeImg] = useState("");
  const [authCodeUuid, setAuthCodeUuid] = useState("");
  const [authCodeLoading, setAuthCodeLoading] = useState(false);
  const [codeValue, setCodeValue] = useState("");
  const [validCodeStatus, setValidCodeStatus] =
    useState<ValidCodeStatus>("idle");
  const [invoiceGenerating, setInvoiceGenerating] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState<{
    fileUrl: string;
    fileName: string;
  } | null>(() => getInvoiceFileFromRecord(record));
  const [invoiceDownloading, setInvoiceDownloading] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const validateTimerRef = useRef<number | undefined>(undefined);
  const canSubmitOrder =
    Boolean(invoiceFile) && codeValue.trim() !== "" && validCodeStatus === "valid";

  function clearValidateTimer() {
    if (validateTimerRef.current) {
      window.clearTimeout(validateTimerRef.current);
      validateTimerRef.current = undefined;
    }
  }

  const loadAuthCode = useCallback(async () => {
    try {
      setAuthCodeLoading(true);
      const response = await fetch("/api/logistics/rishenghui/auth-code", {
        cache: "no-store",
      });
      const payload = (await response
        .json()
        .catch(() => null)) as AuthCodeResponse | null;

      if (!response.ok || !payload?.img || !payload.uuid) {
        throw new Error(payload?.error || "验证码获取失败");
      }

      setAuthCodeImg(payload.img);
      setAuthCodeUuid(payload.uuid);
      setCodeValue("");
      clearValidateTimer();
      setValidCodeStatus("idle");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "验证码获取失败");
      setAuthCodeImg("");
      setAuthCodeUuid("");
      clearValidateTimer();
      setValidCodeStatus("idle");
    } finally {
      setAuthCodeLoading(false);
    }
  }, [message]);

  const validateAuthCode = useCallback(
    async (code: string, uuid: string) => {
      try {
        setValidCodeStatus("validating");
        const params = new URLSearchParams({ uuid, code });
        const response = await fetch(
          `/api/logistics/rishenghui/valid-code?${params}`,
          { cache: "no-store" },
        );
        const payload = (await response
          .json()
          .catch(() => null)) as ValidCodeResponse | null;

        if (!response.ok) {
          throw new Error(payload?.error || "验证码校验失败");
        }

        setValidCodeStatus(payload?.valid ? "valid" : "invalid");
      } catch (error) {
        setValidCodeStatus("invalid");
        message.error(
          error instanceof Error ? error.message : "验证码校验失败",
        );
      }
    },
    [message],
  );

  function scheduleValidateAuthCode(value: string) {
    const code = value.trim();
    clearValidateTimer();

    if (!code || !authCodeUuid) {
      setValidCodeStatus("idle");
      return;
    }

    setValidCodeStatus("idle");
    validateTimerRef.current = window.setTimeout(() => {
      void validateAuthCode(code, authCodeUuid);
    }, 500);
  }

  function resetState() {
    setCodeValue("");
    setAuthCodeImg("");
    setAuthCodeUuid("");
    setInvoiceGenerating(false);
    setInvoiceDownloading(false);
    setAccessToken("");
    setOrderSubmitting(false);
    clearValidateTimer();
    setValidCodeStatus("idle");
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
      setAccessToken("");
      message.success("下单发票生成成功");
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

    const code = codeValue.trim();
    if (!authCodeUuid) {
      message.error("请先获取验证码图片");
      return;
    }

    if (!code) {
      message.error("请输入验证码");
      return;
    }

    if (validCodeStatus !== "valid") {
      message.error("请先输入正确的验证码");
      return;
    }

    try {
      setOrderSubmitting(true);
      const token =
        accessToken.trim() ||
        (await onGetAccessToken({
          code,
          uuid: authCodeUuid,
        }));
      setAccessToken(token);

      const result = await onSubmitOrder({
        shipmentId: record.id,
        fileUrl: invoiceFile.fileUrl,
        fileName: invoiceFile.fileName,
        accessToken: token,
      });
      onSubmitSuccess(result.record);
      message.success(`${record.shipment_no?.trim() || record.id}下单成功`);
      handleClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "下单失败");
    } finally {
      setOrderSubmitting(false);
    }
  }

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => {
      setCodeValue("");
      setInvoiceFile(getInvoiceFileFromRecord(record));
      setInvoiceDownloading(false);
      setAccessToken("");
      setOrderSubmitting(false);
      void loadAuthCode();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadAuthCode, open, record]);

  return (
    <Modal
      title={null}
      open={open}
      width={620}
      destroyOnHidden
      maskClosable={false}
      onCancel={handleClose}
      footer={
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
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <label className="w-16 shrink-0 text-sm text-slate-700">货件号</label>
          <Typography.Text>{record?.shipment_no?.trim() || "-"}</Typography.Text>
        </div>
        <div className="flex items-start gap-3">
          <label className="w-16 shrink-0 pt-1.5 text-sm text-slate-700">
            验证码
          </label>
          <div className="min-w-0 flex-1">
            <Space.Compact className="!flex">
              <Input
                value={codeValue}
                status={validCodeStatus === "invalid" ? "error" : undefined}
                placeholder="请输入验证码"
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setCodeValue(nextValue);
                  scheduleValidateAuthCode(nextValue);
                }}
              />
              <div className="flex h-8 min-w-32 items-center justify-center border border-l-0 border-slate-200 bg-white px-2">
                {authCodeImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={authCodeImg}
                    alt="验证码"
                    className="h-7 max-w-28 object-contain"
                  />
                ) : null}
              </div>
              <Button
                icon={<ReloadOutlined />}
                loading={authCodeLoading}
                onClick={() => void loadAuthCode()}
              />
            </Space.Compact>
            {validCodeStatus === "invalid" ? (
              <div className="mt-1 text-sm text-red-500">验证码错误</div>
            ) : null}
          </div>
        </div>
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
