"use client";

import { App, Button, Drawer, Form, Input, Select, Space } from "antd";
import type { FormProps } from "antd";
import { useState } from "react";

import type { StoreCreateValues } from "../_lib/stores";
import { createStoreRecord } from "../_lib/stores-request";

type StoreCreateDrawerProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export default function StoreCreateDrawer({
  open,
  onClose,
  onCreated,
}: StoreCreateDrawerProps) {
  const [form] = Form.useForm<StoreCreateValues>();
  const [submitting, setSubmitting] = useState(false);
  const { message } = App.useApp();

  const handleFinish: FormProps<StoreCreateValues>["onFinish"] = async (
    values,
  ) => {
    try {
      setSubmitting(true);
      await createStoreRecord(values);
      message.success("店铺新增成功");
      form.resetFields();
      onCreated();
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "请检查数据库权限或字段内容";
      message.error(`店铺新增失败：${description}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      title="新增店铺"
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
      <Form<StoreCreateValues>
        form={form}
        layout="vertical"
        requiredMark
        initialValues={{ seller_type: "CBT" }}
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

        <Form.Item label="店铺地址" name="seller_address">
          <Input placeholder="请输入店铺链接" />
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
