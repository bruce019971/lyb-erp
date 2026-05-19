"use client";

import { App, Button, Drawer, Form, Input, Select, Space } from "antd";
import type { FormProps } from "antd";
import { useMemo, useState } from "react";

import type { StoreRecord, StoreUpdateValues } from "../_lib/stores";
import { updateStoreRecord } from "../_lib/stores-request";
import { generateStoreCode } from "../_lib/store-code";

type StoreEditDrawerProps = {
  open: boolean;
  record?: StoreRecord;
  onClose: () => void;
  onUpdated: () => void;
};

export default function StoreEditDrawer({
  open,
  record,
  onClose,
  onUpdated,
}: StoreEditDrawerProps) {
  const [submitting, setSubmitting] = useState(false);
  const { message } = App.useApp();
  const initialValues = useMemo<StoreUpdateValues>(
    () => ({
      seller_id: record?.seller_id ?? "",
      seller_name: record?.seller_name ?? "",
      seller_alias: record?.seller_alias ?? record?.seller_name ?? "",
      seller_code:
        record?.seller_code ?? generateStoreCode(record?.seller_name ?? ""),
      seller_type: record?.seller_type ?? "CBT",
    }),
    [record],
  );

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
              htmlType="submit"
              form="store-edit-form"
              type="primary"
              loading={submitting}
            >
              保存
            </Button>
          </Space>
        </div>
      }
    >
      <Form<StoreUpdateValues>
        key={record?.id ?? "store-edit"}
        id="store-edit-form"
        layout="vertical"
        requiredMark
        initialValues={initialValues}
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

        <Form.Item
          label="别名"
          name="seller_alias"
          rules={[
            { required: true, whitespace: true, message: "请输入别名" },
          ]}
        >
          <Input placeholder="请输入别名" maxLength={200} showCount />
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

      </Form>
    </Drawer>
  );
}
