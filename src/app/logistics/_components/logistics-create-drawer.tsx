"use client";

import { App, Button, Drawer, Form, Input, InputNumber, Space } from "antd";
import type { FormProps } from "antd";
import { useState } from "react";

import type { LogisticsProviderCreateValues } from "../_lib/logistics";
import { createLogisticsProviderRecord } from "../_lib/logistics-request";

type LogisticsCreateDrawerProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export default function LogisticsCreateDrawer({
  open,
  onClose,
  onCreated,
}: LogisticsCreateDrawerProps) {
  const [form] = Form.useForm<LogisticsProviderCreateValues>();
  const [submitting, setSubmitting] = useState(false);
  const { message } = App.useApp();

  const handleFinish: FormProps<LogisticsProviderCreateValues>["onFinish"] =
    async (values) => {
      try {
        setSubmitting(true);
        await createLogisticsProviderRecord(values);
        message.success("物流商新增成功");
        form.resetFields();
        onCreated();
      } catch (error) {
        const description =
          error instanceof Error ? error.message : "请检查数据库权限或字段内容";
        message.error(`物流商新增失败：${description}`);
      } finally {
        setSubmitting(false);
      }
    };

  return (
    <Drawer
      title="新增物流商"
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
      <Form<LogisticsProviderCreateValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={handleFinish}
        onFinishFailed={() => message.error("请先完善必填信息")}
      >
        <Form.Item
          label="物流商"
          name="provider_name"
          rules={[
            { required: true, whitespace: true, message: "请输入物流商" },
          ]}
        >
          <Input placeholder="请输入物流商名称" maxLength={200} showCount />
        </Form.Item>

        <Form.Item label="系统链接" name="system_url">
          <Input placeholder="请输入系统链接" />
        </Form.Item>

        <Form.Item label="用户名" name="username">
          <Input placeholder="请输入用户名" maxLength={200} showCount />
        </Form.Item>

        <Form.Item label="密码" name="password">
          <Input.Password placeholder="请输入密码" maxLength={200} />
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
