"use client";

import { FileSyncOutlined } from "@ant-design/icons";
import { Alert, App, Button, Modal, Space, Typography, Input } from "antd";
import { useMemo, useState } from "react";

import {
  batchGenerateShipmentCartonLabels,
  type ShipmentBatchCartonLabelResponse,
} from "../_lib/shipments-request";

type ShipmentBatchCartonLabelModalProps = {
  open: boolean;
  initialShipmentNos: string[];
  onClose: () => void;
  onFinished: () => void;
};

function parseShipmentNos(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\s,，;；]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export default function ShipmentBatchCartonLabelModal({
  open,
  initialShipmentNos,
  onClose,
  onFinished,
}: ShipmentBatchCartonLabelModalProps) {
  const { message } = App.useApp();
  const [inputValue, setInputValue] = useState(() =>
    initialShipmentNos.join("\n"),
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] =
    useState<ShipmentBatchCartonLabelResponse | null>(null);
  const shipmentNos = useMemo(() => parseShipmentNos(inputValue), [inputValue]);

  async function handleSubmit() {
    if (!shipmentNos.length) {
      message.error("请输入需要处理的货件号");
      return;
    }

    try {
      setSubmitting(true);
      const nextResult = await batchGenerateShipmentCartonLabels(shipmentNos);
      setResult(nextResult);
      message.success(
        `处理完成：成功 ${nextResult.successCount} 个，失败 ${nextResult.failureCount} 个`,
      );
      onFinished();
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "外箱标签批量处理失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (submitting) return;

    setInputValue("");
    setResult(null);
    onClose();
  }

  return (
    <Modal
      title="批量生成外箱标签"
      open={open}
      width={680}
      destroyOnHidden
      maskClosable={false}
      onCancel={handleClose}
      footer={
        <div className="flex justify-end">
          <Space>
            <Button disabled={submitting} onClick={handleClose}>
              关闭
            </Button>
            <Button
              type="primary"
              icon={<FileSyncOutlined />}
              loading={submitting}
              onClick={() => void handleSubmit()}
            >
              开始处理
            </Button>
          </Space>
        </div>
      }
    >
      <div className="space-y-4">
        <Input.TextArea
          value={inputValue}
          rows={8}
          placeholder="请输入货件号，支持换行、空格、逗号分隔"
          onChange={(event) => setInputValue(event.target.value)}
        />
        <Typography.Text type="secondary">
          已识别 {shipmentNos.length} 个货件号
        </Typography.Text>
        {result ? (
          <Alert
            type={result.failureCount ? "warning" : "success"}
            showIcon
            message={`成功 ${result.successCount} 个，失败 ${result.failureCount} 个`}
            description={
              result.failureCount ? (
                <div className="mt-2 max-h-48 overflow-auto">
                  {result.results
                    .filter((item) => !item.success)
                    .map((item) => (
                      <div key={item.shipmentNo}>
                        <Typography.Text strong>
                          {item.shipmentNo}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          ：{item.error ?? "处理失败"}
                        </Typography.Text>
                      </div>
                    ))}
                </div>
              ) : undefined
            }
          />
        ) : null}
      </div>
    </Modal>
  );
}
