"use client";

import { App, Button, Drawer, Form, InputNumber, Space } from "antd";
import type { FormProps } from "antd";
import { useEffect, useState } from "react";

import type { FreightRecord, FreightUpdateValues } from "../_lib/freights";
import { updateFreightRecord } from "../_lib/freights-request";

type FreightsEditDrawerProps = {
  open: boolean;
  record?: FreightRecord;
  onClose: () => void;
  onUpdated: () => void;
};

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return "请检查数据库权限或字段内容";
}

export default function FreightsEditDrawer({
  open,
  record,
  onClose,
  onUpdated,
}: FreightsEditDrawerProps) {
  const [form] = Form.useForm<FreightUpdateValues>();
  const [submitting, setSubmitting] = useState(false);
  const { message } = App.useApp();

  useEffect(() => {
    if (!open || !record) return;

    form.setFieldsValue({
      freight_unit_price: record.freight_unit_price,
      volume: record.volume,
      extra_fee: record.extra_fee,
      total_fee: record.total_fee,
    });
  }, [form, open, record]);

  const handleFinish: FormProps<FreightUpdateValues>["onFinish"] = async (
    values,
  ) => {
    if (!record) return;

    try {
      setSubmitting(true);
      await updateFreightRecord(record.id, values);
      message.success("运费信息修改成功");
      onUpdated();
    } catch (error) {
      message.error(`运费信息修改失败：${getErrorMessage(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      title="编辑运费"
      width={640}
      open={open}
      forceRender
      destroyOnHidden
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button
              type="primary"
              loading={submitting}
              onClick={() => {
                form.submit();
              }}
            >
              保存
            </Button>
          </Space>
        </div>
      }
    >
      <div className="mb-4 grid grid-cols-1 gap-4 rounded-md bg-slate-50 p-4 md:grid-cols-2">
        <div>
          <div className="mb-1 text-xs text-slate-500">货件号</div>
          <div>{record?.shipment_no ?? ""}</div>
        </div>
        <div>
          <div className="mb-1 text-xs text-slate-500">物流商</div>
          <div>{record?.logistics_provider ?? ""}</div>
        </div>
        <div className="md:col-span-2">
          <div className="mb-1 text-xs text-slate-500">产品名称</div>
          <div>{record?.product_name ?? ""}</div>
        </div>
      </div>

      <Form<FreightUpdateValues>
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        onFinishFailed={() => message.error("请先检查表单内容")}
      >
        <Form.Item label="运费单价" name="freight_unit_price">
          <InputNumber className="!w-full" min={0} precision={2} />
        </Form.Item>

        <Form.Item label="方数/CBM" name="volume">
          <InputNumber className="!w-full" min={0} precision={3} />
        </Form.Item>

        <Form.Item label="额外费用" name="extra_fee">
          <InputNumber className="!w-full" min={0} precision={2} />
        </Form.Item>

        <Form.Item label="总费用" name="total_fee">
          <InputNumber className="!w-full" min={0} precision={2} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
