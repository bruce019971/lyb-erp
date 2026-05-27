"use client";

import { App, Button, Drawer, Form, Input, InputNumber, Space } from "antd";
import type { FormProps } from "antd";
import { useRef, useState } from "react";

import type { LogisticsProviderCreateValues } from "../_lib/logistics";
import { createLogisticsProviderRecord } from "../_lib/logistics-request";
import LogisticsInvoiceTemplateUpload from "./logistics-invoice-template-upload";

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
  const [invoiceTemplateUploading, setInvoiceTemplateUploading] = useState(false);
  const [invoiceTemplateUrl, setInvoiceTemplateUrl] = useState<
    string | null | undefined
  >(undefined);
  const invoiceTemplateUrlRef = useRef<string | null | undefined>(undefined);
  const { message } = App.useApp();
  const providerName = Form.useWatch("provider_name", form);

  function handleInvoiceTemplateUrlChange(url: string | null) {
    invoiceTemplateUrlRef.current = url;
    setInvoiceTemplateUrl(url ?? undefined);
  }

  const handleFinish: FormProps<LogisticsProviderCreateValues>["onFinish"] =
    async (values) => {
      try {
        setSubmitting(true);
        await createLogisticsProviderRecord({
          ...values,
          invoice_template_url:
            invoiceTemplateUrlRef.current !== undefined
              ? invoiceTemplateUrlRef.current
              : values.invoice_template_url,
        });
        message.success("物流商新增成功");
        form.resetFields();
        invoiceTemplateUrlRef.current = undefined;
        setInvoiceTemplateUrl(undefined);
        onCreated();
      } catch (error) {
        const description =
          error instanceof Error ? error.message : "请检查数据库权限或字段内容";
        message.error(`物流商新增失败：${description}`);
      } finally {
        setSubmitting(false);
      }
    };

  function handleClose() {
    form.resetFields();
    invoiceTemplateUrlRef.current = undefined;
    setInvoiceTemplateUrl(undefined);
    setInvoiceTemplateUploading(false);
    onClose();
  }

  return (
    <Drawer
      title="新增物流商"
      width={640}
      open={open}
      forceRender
      destroyOnHidden
      onClose={handleClose}
      footer={
        <div className="flex justify-end">
          <Space>
            <Button onClick={handleClose}>取消</Button>
            <Button
              type="primary"
              loading={submitting || invoiceTemplateUploading}
              disabled={invoiceTemplateUploading}
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

        <Form.Item label="发票模板">
          <LogisticsInvoiceTemplateUpload
            fileUrl={invoiceTemplateUrl}
            providerName={providerName}
            uploading={invoiceTemplateUploading}
            onUploadingChange={setInvoiceTemplateUploading}
            onUrlChange={handleInvoiceTemplateUrlChange}
          />
        </Form.Item>

        <Form.Item
          label="运费单价"
          name="freight_unit_price"
          rules={[
            {
              validator: async (_, value?: number | null) => {
                if (value === undefined || value === null) return;
                if (!Number.isFinite(value) || value < 0) {
                  throw new Error("运费单价不能小于0");
                }
              },
            },
          ]}
        >
          <InputNumber
            className="!w-full"
            min={0}
            precision={2}
            placeholder="请输入运费单价"
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
