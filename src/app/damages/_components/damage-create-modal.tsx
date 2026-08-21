"use client";

import {
  App,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Statistic,
} from "antd";
import type { FormProps } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";

import {
  calculateDamageValues,
  type DamageCreateValues,
  type DamageShipmentOption,
} from "../_lib/damages";
import { createDamageRecord } from "../_lib/damages-request";

type DamageCreateModalProps = {
  open: boolean;
  shipmentOptions: DamageShipmentOption[];
  onClose: () => void;
  onCreated: () => void;
};

type DamageFormValues = Omit<
  DamageCreateValues,
  "delivery_date" | "shipment_record_id"
> & {
  shipment_record_id?: string;
  delivery_date?: Dayjs | null;
};

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }

  return "请检查数据库权限或字段内容";
}

export default function DamageCreateModal({
  open,
  shipmentOptions,
  onClose,
  onCreated,
}: DamageCreateModalProps) {
  const [form] = Form.useForm<DamageFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const { message } = App.useApp();
  const productCount = Form.useWatch("product_count", form);
  const damageCount = Form.useWatch("damage_count", form);
  const freightUnitPrice = Form.useWatch("freight_unit_price", form);
  const productUnitPrice = Form.useWatch("product_unit_price", form);
  const calculatedValues = calculateDamageValues({
    damageCount,
    freightUnitPrice,
    productUnitPrice,
  });

  const optionByShipmentNo = useMemo(() => {
    const options = new Map<string, DamageShipmentOption>();
    shipmentOptions.forEach((item) => {
      if (!options.has(item.delivery_shipment_no)) {
        options.set(item.delivery_shipment_no, item);
      }
    });
    return options;
  }, [shipmentOptions]);
  const selectOptions = useMemo(
    () =>
      Array.from(optionByShipmentNo.keys()).map((value) => ({
        label: value,
        value,
      })),
    [optionByShipmentNo],
  );

  function handleShipmentChange(deliveryShipmentNo?: string) {
    const option = deliveryShipmentNo
      ? optionByShipmentNo.get(deliveryShipmentNo.trim())
      : undefined;

    form.setFieldsValue({
      shipment_record_id: option?.shipment_record_id,
      product_name: option?.product_name ?? undefined,
      delivery_store: option?.delivery_store ?? undefined,
      delivery_date: option?.delivery_date ? dayjs(option.delivery_date) : undefined,
      product_count: option?.product_count ?? undefined,
      damage_count: undefined,
      freight_unit_price: option?.freight_unit_price ?? undefined,
      product_unit_price: option?.product_unit_price ?? undefined,
    });
  }

  const handleFinish: FormProps<DamageFormValues>["onFinish"] = async (
    values,
  ) => {
    if (!values.delivery_date || !values.shipment_record_id) return;

    try {
      setSubmitting(true);
      await createDamageRecord({
        ...values,
        shipment_record_id: values.shipment_record_id,
        delivery_date: values.delivery_date.format("YYYY-MM-DD"),
      });
      message.success("货损记录新增成功");
      form.resetFields();
      onCreated();
    } catch (error) {
      message.error(`货损记录新增失败：${getErrorMessage(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  function handleClose() {
    form.resetFields();
    onClose();
  }

  return (
    <Modal
      title="新增货损"
      open={open}
      width={760}
      centered
      destroyOnHidden
      okText="保存"
      cancelText="取消"
      confirmLoading={submitting}
      onCancel={handleClose}
      onOk={() => form.submit()}
    >
      <Form<DamageFormValues>
        form={form}
        layout="vertical"
        className="pt-4"
        onFinish={handleFinish}
        onFinishFailed={() => message.error("请先完善必填信息")}
      >
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <Form.Item
            label="送仓货件号"
            name="delivery_shipment_no"
            rules={[
              {
                required: true,
                message: "请选择送仓货件号",
              },
            ]}
          >
            <Select
              showSearch
              allowClear
              optionFilterProp="label"
              placeholder="请选择送仓货件号"
              options={selectOptions}
              onChange={handleShipmentChange}
            />
          </Form.Item>

          <Form.Item
            name="shipment_record_id"
            rules={[{ required: true, message: "请选择送仓货件号" }]}
            hidden
          >
            <Input />
          </Form.Item>

          <Form.Item
            label="产品名称"
            name="product_name"
            rules={[{ required: true, whitespace: true, message: "请输入产品名称" }]}
          >
            <Input placeholder="选择货件后自动带出" />
          </Form.Item>

          <Form.Item
            label="送仓店铺"
            name="delivery_store"
            rules={[{ required: true, whitespace: true, message: "请输入送仓店铺" }]}
          >
            <Input placeholder="选择货件后自动带出" />
          </Form.Item>

          <Form.Item
            label="送仓日期"
            name="delivery_date"
            rules={[{ required: true, message: "请选择送仓日期" }]}
          >
            <DatePicker className="!w-full" format="YYYY/MM/DD" />
          </Form.Item>

          <Form.Item
            label="产品数量"
            name="product_count"
            rules={[
              { required: true, message: "请输入产品数量" },
              {
                validator: async (_, value?: number) => {
                  if (value === undefined) return;
                  if (!Number.isInteger(value) || value <= 0) {
                    throw new Error("产品数量必须为大于0的整数");
                  }
                },
              },
            ]}
          >
            <InputNumber
              className="!w-full"
              min={1}
              precision={0}
              placeholder="请输入产品数量"
            />
          </Form.Item>

          <Form.Item
            label="货损数量"
            name="damage_count"
            dependencies={["product_count"]}
            rules={[
              { required: true, message: "请输入货损数量" },
              {
                validator: async (_, value?: number) => {
                  if (value === undefined) return;
                  if (!Number.isInteger(value) || value <= 0) {
                    throw new Error("货损数量必须为大于0的整数");
                  }
                  if (typeof productCount === "number" && value > productCount) {
                    throw new Error("货损数量不能大于产品数量");
                  }
                },
              },
            ]}
          >
            <InputNumber
              className="!w-full"
              min={1}
              max={productCount}
              precision={0}
              placeholder="请输入货损数量"
            />
          </Form.Item>

          <Form.Item
            label="单个运费"
            name="freight_unit_price"
            rules={[{ required: true, message: "请输入单个运费" }]}
          >
            <InputNumber
              className="!w-full"
              min={0}
              precision={2}
              prefix="¥"
              placeholder="选择货件后自动带出"
            />
          </Form.Item>

          <Form.Item
            label="产品单价"
            name="product_unit_price"
            rules={[{ required: true, message: "请输入产品单价" }]}
          >
            <InputNumber
              className="!w-full"
              min={0}
              precision={2}
              prefix="¥"
              placeholder="请输入产品单价"
            />
          </Form.Item>
        </div>

        <div className="grid grid-cols-3 gap-4 border-t border-slate-200 pt-4">
          <Statistic
            title="产品价值"
            value={calculatedValues.productValue}
            precision={2}
            prefix="¥"
          />
          <Statistic
            title="运费价值"
            value={calculatedValues.freightValue}
            precision={2}
            prefix="¥"
          />
          <Statistic
            title="总价值"
            value={calculatedValues.totalValue}
            precision={2}
            prefix="¥"
            valueStyle={{ fontWeight: 600 }}
          />
        </div>
      </Form>
    </Modal>
  );
}
