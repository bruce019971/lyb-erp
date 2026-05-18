"use client";

import { App, Button, Drawer, Form, Input, InputNumber, Select, Space } from "antd";
import type { FormProps } from "antd";
import { useEffect, useState } from "react";

import type { StoreRecord, StoreUpdateValues } from "../_lib/stores";
import { updateStoreRecord } from "../_lib/stores-request";
import { generateStoreCode } from "../_lib/store-code";

type StoreEditDrawerProps = {
  open: boolean;
  record?: StoreRecord;
  onClose: () => void;
  onUpdated: () => void;
};

function toNumberInputValue(value?: number | string | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export default function StoreEditDrawer({
  open,
  record,
  onClose,
  onUpdated,
}: StoreEditDrawerProps) {
  const [form] = Form.useForm<StoreUpdateValues>();
  const [submitting, setSubmitting] = useState(false);
  const { message } = App.useApp();
  const sellerName = Form.useWatch("seller_name", form);

  useEffect(() => {
    if (!open || !record) return;

    form.setFieldValue("seller_id", record.seller_id ?? "");
    form.setFieldValue("seller_name", record.seller_name ?? "");
    form.setFieldValue(
      "seller_code",
      record.seller_code ?? generateStoreCode(record.seller_name ?? ""),
    );
    form.setFieldValue("seller_type", record.seller_type ?? "CBT");
    form.setFieldValue(
      "product_label_unit_price",
      toNumberInputValue(record.product_label_unit_price),
    );
    form.setFieldValue(
      "carton_label_unit_price",
      toNumberInputValue(record.carton_label_unit_price),
    );
  }, [form, open, record]);

  useEffect(() => {
    if (!open) return;
    if (!sellerName) return;
    form.setFieldValue("seller_code", generateStoreCode(sellerName));
  }, [form, open, sellerName]);

  const handleFinish: FormProps<StoreUpdateValues>["onFinish"] = async (
    values,
  ) => {
    if (!record) return;

    try {
      setSubmitting(true);
      await updateStoreRecord(record.id, values);
      message.success("店铺修改成功");
      onUpdated();
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "请检查数据库权限或字段内容";
      message.error(`店铺修改失败：${description}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      title="编辑店铺"
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
      <Form<StoreUpdateValues>
        form={form}
        layout="vertical"
        requiredMark
        onFinish={handleFinish}
        onFinishFailed={() => message.error("请先完善必填信息")}
      >
        <Form.Item
          label="店铺ID"
          name="seller_id"
          rules={[{ required: true, whitespace: true, message: "请输入店铺ID" }]}
        >
          <Input placeholder="请输入店铺ID" maxLength={100} showCount />
        </Form.Item>

        <Form.Item
          label="店铺名称"
          name="seller_name"
          rules={[
            { required: true, whitespace: true, message: "请输入店铺名称" },
          ]}
        >
          <Input placeholder="请输入店铺名称" maxLength={200} showCount />
        </Form.Item>

        <Form.Item label="店铺Code" name="seller_code">
          <Input placeholder="根据店铺名称自动生成" readOnly disabled />
        </Form.Item>

        <Form.Item label="店铺类型" name="seller_type">
          <Select
            options={[
              { label: "CBT", value: "CBT" },
              { label: "本土", value: "本土" },
            ]}
          />
        </Form.Item>

        <Form.Item
          label="产品标单价"
          name="product_label_unit_price"
          rules={[
            {
              validator: async (_, value?: number | null) => {
                if (value === undefined || value === null) return;
                if (!Number.isFinite(value) || value < 0) {
                  throw new Error("产品标单价不能小于0");
                }
              },
            },
          ]}
        >
          <InputNumber
            className="!w-full"
            min={0}
            precision={2}
            placeholder="请输入产品标单价"
          />
        </Form.Item>

        <Form.Item
          label="外箱标单价"
          name="carton_label_unit_price"
          rules={[
            {
              validator: async (_, value?: number | null) => {
                if (value === undefined || value === null) return;
                if (!Number.isFinite(value) || value < 0) {
                  throw new Error("外箱标单价不能小于0");
                }
              },
            },
          ]}
        >
          <InputNumber
            className="!w-full"
            min={0}
            precision={2}
            placeholder="请输入外箱标单价"
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
