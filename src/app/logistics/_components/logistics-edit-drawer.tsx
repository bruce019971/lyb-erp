"use client";

import { App, Button, Drawer, Form, Input, InputNumber, Space } from "antd";
import type { FormProps } from "antd";
import { useEffect, useRef, useState } from "react";

import type {
  LogisticsProviderRecord,
  LogisticsProviderUpdateValues,
} from "../_lib/logistics";
import { updateLogisticsProviderRecord } from "../_lib/logistics-request";
import LogisticsInvoiceTemplateUpload from "./logistics-invoice-template-upload";

type LogisticsEditDrawerProps = {
  open: boolean;
  record?: LogisticsProviderRecord;
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

function toNumberInputValue(value?: number | string | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function freightUnitPriceRule(label: string) {
  return {
    validator: async (_: unknown, value?: number | null) => {
      if (value === undefined || value === null) return;
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${label}不能小于0`);
      }
    },
  };
}

export default function LogisticsEditDrawer({
  open,
  record,
  onClose,
  onUpdated,
}: LogisticsEditDrawerProps) {
  const [form] = Form.useForm<LogisticsProviderUpdateValues>();
  const [submitting, setSubmitting] = useState(false);
  const [invoiceTemplateUploading, setInvoiceTemplateUploading] = useState(false);
  const [invoiceTemplateUrlOverride, setInvoiceTemplateUrlOverride] = useState<
    string | null | undefined
  >(undefined);
  const invoiceTemplateUrlRef = useRef<string | null | undefined>(
    record?.invoice_template_url ?? undefined,
  );
  const { message } = App.useApp();
  const providerName = Form.useWatch("provider_name", form);

  function handleInvoiceTemplateUrlChange(url: string | null) {
    invoiceTemplateUrlRef.current = url;
    setInvoiceTemplateUrlOverride(url);
  }

  useEffect(() => {
    if (!open || !record) return;

    form.setFieldsValue({
      provider_name: record.provider_name ?? "",
      system_url: record.system_url ?? "",
      username: record.username ?? "",
      password: record.password ?? "",
      general_freight_unit_price: toNumberInputValue(
        record.general_freight_unit_price,
      ),
      textile_freight_unit_price: toNumberInputValue(
        record.textile_freight_unit_price,
      ),
      product_label_unit_price: toNumberInputValue(
        record.product_label_unit_price,
      ),
      carton_label_unit_price: toNumberInputValue(
        record.carton_label_unit_price,
      ),
    });
    invoiceTemplateUrlRef.current = record.invoice_template_url ?? undefined;
  }, [form, open, record]);

  const handleFinish: FormProps<LogisticsProviderUpdateValues>["onFinish"] =
    async (values) => {
      if (!record) return;

      try {
        setSubmitting(true);
        await updateLogisticsProviderRecord(record.id, {
          ...values,
          invoice_template_url:
            invoiceTemplateUrlRef.current !== undefined
              ? invoiceTemplateUrlRef.current
              : values.invoice_template_url,
        });
        message.success("物流商修改成功");
        onUpdated();
      } catch (error) {
        const description = getErrorMessage(error);
        message.error(`物流商修改失败：${description}`);
      } finally {
        setSubmitting(false);
      }
    };

  function handleClose() {
    form.resetFields();
    invoiceTemplateUrlRef.current = record?.invoice_template_url ?? undefined;
    setInvoiceTemplateUrlOverride(undefined);
    setInvoiceTemplateUploading(false);
    onClose();
  }

  return (
    <Drawer
      title="编辑物流商"
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
      <Form<LogisticsProviderUpdateValues>
        form={form}
        layout="vertical"
        requiredMark
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
            key={record?.id ?? "new"}
            fileUrl={
              invoiceTemplateUrlOverride !== undefined
                ? invoiceTemplateUrlOverride
                : record?.invoice_template_url
            }
            providerName={providerName}
            uploading={invoiceTemplateUploading}
            onUploadingChange={setInvoiceTemplateUploading}
            onUrlChange={handleInvoiceTemplateUrlChange}
          />
        </Form.Item>

        <Form.Item
          label="普货运费单价"
          name="general_freight_unit_price"
          rules={[freightUnitPriceRule("普货运费单价")]}
        >
          <InputNumber
            className="!w-full"
            min={0}
            precision={2}
            placeholder="请输入普货运费单价"
          />
        </Form.Item>

        <Form.Item
          label="纺织品运费单价"
          name="textile_freight_unit_price"
          rules={[freightUnitPriceRule("纺织品运费单价")]}
        >
          <InputNumber
            className="!w-full"
            min={0}
            precision={2}
            placeholder="请输入纺织品运费单价"
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
