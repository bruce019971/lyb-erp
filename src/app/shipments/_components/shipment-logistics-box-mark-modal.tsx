"use client";

import { App, Button, Modal, Space, Typography } from "antd";

import type { ShipmentRecord } from "../_lib/shipments";
import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";

type ShipmentLogisticsBoxMarkModalProps = {
  open: boolean;
  record?: ShipmentRecord;
  logisticsOptions: LogisticsProviderOption[];
  accessToken?: string;
  onClose: () => void;
  onGenerate: (values: {
    record: ShipmentRecord;
    accessToken: string;
  }) => void;
  onTokenRequired: () => void;
};

function findLogisticsProvider(
  record: ShipmentRecord | undefined,
  logisticsOptions: LogisticsProviderOption[],
) {
  const providerName = record?.logistics_provider?.trim();
  if (!providerName) return undefined;

  return logisticsOptions.find(
    (item) => item.provider_name?.trim() === providerName,
  );
}

export default function ShipmentLogisticsBoxMarkModal({
  open,
  record,
  logisticsOptions,
  accessToken,
  onClose,
  onGenerate,
  onTokenRequired,
}: ShipmentLogisticsBoxMarkModalProps) {
  const { message } = App.useApp();
  const provider = findLogisticsProvider(record, logisticsOptions);

  function handleClose() {
    onClose();
  }

  function handleSubmit() {
    if (!record?.id) {
      message.error("缺少货件ID");
      return;
    }

    const token = accessToken?.trim();
    if (!token) {
      Modal.warning({
        title: "请先获取日升辉Token",
        content: "当前没有可用的日升辉Token，请先在列表右上角获取Token。",
        okText: "去获取",
        onOk: onTokenRequired,
      });
      return;
    }

    onGenerate({
      record,
      accessToken: token,
    });
    handleClose();
  }

  return (
    <Modal
      title={null}
      open={open}
      width={520}
      destroyOnHidden
      maskClosable={false}
      closable={false}
      onCancel={handleClose}
      footer={
        <div className="flex justify-end">
          <Space>
            <Button onClick={handleClose}>取消</Button>
            <Button
              type="primary"
              onClick={handleSubmit}
            >
              生成箱唛
            </Button>
          </Space>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <label className="w-20 shrink-0 text-sm text-slate-700">物流商</label>
          <Typography.Text>
            {provider?.provider_name?.trim() || record?.logistics_provider || "-"}
          </Typography.Text>
        </div>
        <div className="flex items-center gap-3">
          <label className="w-20 shrink-0 text-sm text-slate-700">Token</label>
          <Typography.Text type={accessToken ? "success" : "danger"}>
            {accessToken ? "已获取" : "未获取"}
          </Typography.Text>
        </div>
      </div>
    </Modal>
  );
}
