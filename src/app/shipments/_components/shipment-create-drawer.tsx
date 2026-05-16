"use client";

import {
  App,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
} from "antd";
import type { FormProps } from "antd";
import { useState } from "react";
import type { Dayjs } from "dayjs";

import type { ShipmentCreateValues } from "../_lib/shipments";
import { createShipmentRecord } from "../_lib/shipments-request";
import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import type { ProductShipmentOption } from "../../products/_lib/products";
import type { StoreOption } from "../../stores/_lib/stores";

type ShipmentCreateDrawerProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  storeOptions: StoreOption[];
  productOptions: ProductShipmentOption[];
  logisticsOptions: LogisticsProviderOption[];
};

type ShipmentDateFieldName =
  | "overseas_warehouse_arrived_at"
  | "appointment_time";

type ShipmentCreateFormValues = Omit<
  ShipmentCreateValues,
  ShipmentDateFieldName
> & {
  overseas_warehouse_arrived_at?: Dayjs | null;
  appointment_time?: Dayjs | null;
};

function serializeDate(value?: Dayjs | null) {
  return value ? value.format("YYYY-MM-DD") : null;
}

function serializeShipmentValues(
  values: ShipmentCreateFormValues,
): ShipmentCreateValues {
  return {
    ...values,
    overseas_warehouse_arrived_at: serializeDate(
      values.overseas_warehouse_arrived_at,
    ),
    appointment_time: serializeDate(values.appointment_time),
  };
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return "请检查数据库权限或字段内容";
}

function TextField({
  label,
  name,
  placeholder,
  disabled,
  required,
}: {
  label: string;
  name: keyof ShipmentCreateFormValues;
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <Form.Item
      label={label}
      name={name}
      rules={required ? [{ required: true, message: placeholder }] : undefined}
    >
      <Input disabled={disabled} placeholder={placeholder} />
    </Form.Item>
  );
}

function DateField({
  label,
  name,
}: {
  label: string;
  name: keyof ShipmentCreateFormValues;
}) {
  return (
    <Form.Item label={label} name={name}>
      <DatePicker className="!w-full" format="YYYY/MM/DD" />
    </Form.Item>
  );
}

function NumberField({
  label,
  name,
  precision,
  required,
}: {
  label: string;
  name: keyof ShipmentCreateFormValues;
  precision?: number;
  required?: boolean;
}) {
  return (
    <Form.Item
      label={label}
      name={name}
      rules={required ? [{ required: true, message: `请输入${label}` }] : undefined}
    >
      <InputNumber className="!w-full" min={0} precision={precision} />
    </Form.Item>
  );
}

export default function ShipmentCreateDrawer({
  open,
  onClose,
  onCreated,
  storeOptions,
  productOptions,
  logisticsOptions,
}: ShipmentCreateDrawerProps) {
  const [form] = Form.useForm<ShipmentCreateFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const { message } = App.useApp();
  const selectedStoreName = Form.useWatch("order_store", form);
  const selectedLogisticsProvider = Form.useWatch("logistics_provider", form);
  const normalizedStoreName = selectedStoreName?.trim();

  const storeSelectOptions = storeOptions.map((item) => ({
    label: item.seller_name,
    value: item.seller_name,
  }));
  const productSelectOptions = productOptions
    .filter(
      (item) =>
        item.product_name?.trim() &&
        normalizedStoreName &&
        item.store_name?.trim() === normalizedStoreName,
    )
    .map((item) => ({
      label: item.product_name,
      value: item.product_name!,
    }));
  const logisticsSelectOptions = logisticsOptions
    .filter((item) => item.provider_name?.trim())
    .map((item) => ({
      label: item.provider_name,
      value: item.provider_name!,
    }));

  function calculateGoodsValue(productName?: string | null, totalQty?: number | null) {
    const selectedProduct = productOptions.find(
      (item) =>
        item.product_name === productName &&
        item.store_name?.trim() === normalizedStoreName,
    );

    if (
      typeof selectedProduct?.product_unit_price !== "number" ||
      !Number.isFinite(selectedProduct.product_unit_price) ||
      typeof totalQty !== "number" ||
      !Number.isFinite(totalQty)
    ) {
      return undefined;
    }

    return roundMoney(selectedProduct.product_unit_price * totalQty);
  }

  function applyCalculatedGoodsValue(values: ShipmentCreateFormValues) {
    const goodsValue = calculateGoodsValue(
      values.product_name,
      values.total_qty,
    );

    return typeof goodsValue === "number"
      ? { ...values, goods_value: goodsValue }
      : values;
  }

  function applyProductSelection(productName?: string) {
    const selectedProduct = productOptions.find(
      (item) =>
        item.product_name === productName &&
        item.store_name?.trim() === normalizedStoreName,
    );

    if (!selectedProduct) return;

    const nextValues: Partial<ShipmentCreateFormValues> = {};
    if (selectedProduct.store_name?.trim()) {
      nextValues.order_store = selectedProduct.store_name.trim();
    }

    if (typeof selectedProduct.pcs_per_carton === "number") {
      nextValues.pcs_per_box = selectedProduct.pcs_per_carton;

      const boxCount = form.getFieldValue("box_count");
      if (typeof boxCount === "number" && Number.isFinite(boxCount)) {
        const totalQty = boxCount * selectedProduct.pcs_per_carton;
        nextValues.total_qty = totalQty;
        nextValues.goods_value = calculateGoodsValue(productName, totalQty);
      }
    }

    const totalQty = form.getFieldValue("total_qty");
    if (
      typeof nextValues.goods_value !== "number" &&
      typeof totalQty === "number" &&
      Number.isFinite(totalQty)
    ) {
      nextValues.goods_value = calculateGoodsValue(productName, totalQty);
    }

    form.setFieldsValue(nextValues);
  }

  function handleStoreChange(storeName?: string) {
    form.setFieldsValue({
      product_name: undefined,
      shipment_no: storeName ? form.getFieldValue("shipment_no") : undefined,
      pcs_per_box: undefined,
      total_qty: undefined,
      goods_value: undefined,
    });
  }

  function handleLogisticsChange(logisticsProvider?: string) {
    if (logisticsProvider) return;

    form.setFieldValue("tracking_no", undefined);
  }

  function handleValuesChange(
    changedValues: Partial<ShipmentCreateFormValues>,
    values: ShipmentCreateFormValues,
  ) {
    if (
      !(
        "box_count" in changedValues ||
        "pcs_per_box" in changedValues ||
        "total_qty" in changedValues
      )
    ) {
      return;
    }

    const nextValues: Partial<ShipmentCreateFormValues> = {};

    const shouldRecalculateTotal =
      "box_count" in changedValues || "pcs_per_box" in changedValues;

    if (
      shouldRecalculateTotal &&
      typeof values.box_count === "number" &&
      Number.isFinite(values.box_count) &&
      typeof values.pcs_per_box === "number" &&
      Number.isFinite(values.pcs_per_box)
    ) {
      nextValues.total_qty = values.box_count * values.pcs_per_box;
    }

    const totalQty = nextValues.total_qty ?? values.total_qty;
    nextValues.goods_value = calculateGoodsValue(values.product_name, totalQty);
    form.setFieldsValue(nextValues);
  }

  const handleFinish: FormProps<ShipmentCreateFormValues>["onFinish"] = async (
    values,
  ) => {
    try {
      setSubmitting(true);
      await createShipmentRecord(
        serializeShipmentValues(applyCalculatedGoodsValue(values)),
      );
      message.success("货件新增成功");
      form.resetFields();
      onCreated();
    } catch (error) {
      message.error(`货件新增失败：${getErrorMessage(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      title="新增货件"
      width={920}
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
      <Form<ShipmentCreateFormValues>
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        onFinishFailed={() => message.error("请先检查表单内容")}
        onValuesChange={handleValuesChange}
      >
        <Form.Item name="goods_value" hidden>
          <InputNumber />
        </Form.Item>
        <Form.Item name="first_leg_batch_fee" hidden>
          <InputNumber />
        </Form.Item>
        <Form.Item name="first_leg_unit_cost" hidden>
          <InputNumber />
        </Form.Item>
        <Form.Item name="pcs_per_box" hidden>
          <InputNumber />
        </Form.Item>
        <Form.Item name="total_qty" hidden>
          <InputNumber />
        </Form.Item>
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <Form.Item
            label="下单店铺"
            name="order_store"
            rules={[{ required: true, message: "请选择下单店铺" }]}
          >
            <Select
              showSearch
              allowClear
              placeholder="请选择下单店铺"
              options={storeSelectOptions}
              optionFilterProp="label"
              onChange={handleStoreChange}
            />
          </Form.Item>
          <TextField
            label="货件号"
            name="shipment_no"
            disabled={!selectedStoreName}
            placeholder={selectedStoreName ? "请输入货件号" : "请先选择下单店铺"}
            required
          />
          <Form.Item
            label="物流商"
            name="logistics_provider"
            rules={[{ required: true, message: "请选择物流商" }]}
          >
            <Select
              showSearch
              allowClear
              placeholder="请选择物流商"
              options={logisticsSelectOptions}
              optionFilterProp="label"
              onChange={handleLogisticsChange}
            />
          </Form.Item>
          <TextField
            label="物流编号"
            name="tracking_no"
            disabled={!selectedLogisticsProvider}
            placeholder={
              selectedLogisticsProvider ? "请输入物流编号" : "请先选择物流商"
            }
            required
          />
          <Form.Item
            label="产品名称"
            name="product_name"
            rules={[{ required: true, message: "请选择产品" }]}
          >
            <Select
              showSearch
              allowClear
              disabled={!selectedStoreName}
              placeholder="请选择产品"
              options={productSelectOptions}
              optionFilterProp="label"
              onChange={applyProductSelection}
            />
          </Form.Item>
          <NumberField label="箱数" name="box_count" precision={0} required />
          <NumberField label="运费单价" name="freight_unit_price" precision={2} />
          <NumberField label="体积" name="volume" precision={3} />
          <DateField
            label="到仓时间"
            name="overseas_warehouse_arrived_at"
          />
          <DateField label="约仓时间" name="appointment_time" />
        </div>
      </Form>
    </Drawer>
  );
}
