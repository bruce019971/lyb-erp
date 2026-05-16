"use client";

import { App, Button, DatePicker, Drawer, Form, Input, Select, Space } from "antd";
import type { FormProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";

import type { StoreOption } from "../../stores/_lib/stores";
import type { ShipmentOption } from "../../shipments/_lib/shipments";
import type {
  RelabelCreateValues,
  RelabelRecord,
  RelabelUpdateValues,
} from "../_lib/relabels";
import { relabelTypeOptions } from "../_lib/relabels";
import {
  createRelabelRecord,
  updateRelabelRecord,
} from "../_lib/relabels-request";

type RelabelFormDrawerProps = {
  open: boolean;
  mode: "create" | "edit";
  record?: RelabelRecord;
  shipmentOptions: ShipmentOption[];
  storeOptions: StoreOption[];
  onClose: () => void;
  onSaved: () => void;
};

type RelabelFormValues = Omit<
  RelabelCreateValues,
  "delivery_time"
> & {
  delivery_time?: Dayjs | null;
};

function toDateInputValue(value?: string | null) {
  return value ? dayjs(value) : null;
}

function serializeDate(value?: Dayjs | null) {
  return value ? value.format("YYYY-MM-DD") : null;
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

export default function RelabelFormDrawer({
  open,
  mode,
  record,
  shipmentOptions,
  storeOptions,
  onClose,
  onSaved,
}: RelabelFormDrawerProps) {
  const [form] = Form.useForm<RelabelFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const { message } = App.useApp();

  const originalShipmentOptions = useMemo(
    () =>
      shipmentOptions
        .filter((item) => item.shipment_no?.trim())
        .map((item) => ({
          label: item.shipment_no!,
          value: item.shipment_no!,
        })),
    [shipmentOptions],
  );

  const deliveryStoreOptions = useMemo(
    () =>
      storeOptions
        .filter((item) => item.seller_name?.trim())
        .map((item) => ({
          label: item.seller_name,
          value: item.seller_name,
        })),
    [storeOptions],
  );

  useEffect(() => {
    if (!open) return;

    if (mode === "edit" && record) {
      form.setFieldsValue({
        original_shipment_no: record.original_shipment_no ?? undefined,
        delivery_store: record.delivery_store ?? undefined,
        delivery_shipment_no: record.delivery_shipment_no ?? undefined,
        relabel_type: record.relabel_type ?? undefined,
        delivery_time: toDateInputValue(record.delivery_time),
      });
      return;
    }

    form.setFieldsValue({
      delivery_store: undefined,
    });
  }, [form, mode, open, record, shipmentOptions]);

  const handleFinish: FormProps<RelabelFormValues>["onFinish"] = async (
    values,
  ) => {
    const payload: RelabelUpdateValues = {
      original_shipment_no: values.original_shipment_no,
      delivery_store: values.delivery_store,
      delivery_shipment_no: values.delivery_shipment_no,
      relabel_type: values.relabel_type,
      delivery_time: serializeDate(values.delivery_time),
    };

    try {
      setSubmitting(true);

      if (mode === "edit" && record) {
        await updateRelabelRecord(record.id, payload);
        message.success("换标记录修改成功");
      } else {
        await createRelabelRecord(payload);
        message.success("换标记录新增成功");
      }

      form.resetFields();
      onSaved();
    } catch (error) {
      message.error(
        `换标记录${mode === "edit" ? "修改" : "新增"}失败：${getErrorMessage(error)}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  function handleClose() {
    form.resetFields();
    onClose();
  }

  return (
    <Drawer
      title={mode === "edit" ? "编辑换标记录" : "新增换标记录"}
      width={720}
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
              loading={submitting}
              onClick={() => form.submit()}
            >
              保存
            </Button>
          </Space>
        </div>
      }
    >
      <Form<RelabelFormValues>
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        onFinishFailed={() => message.error("请先检查表单内容")}
      >
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <Form.Item
            label="原货件号"
            name="original_shipment_no"
            rules={[{ required: true, message: "请选择原货件号" }]}
          >
            <Select
              showSearch
              allowClear
              placeholder="请选择原货件号"
              optionFilterProp="label"
              options={originalShipmentOptions}
            />
          </Form.Item>

          <Form.Item
            label="送仓货件号"
            name="delivery_shipment_no"
          >
            <Input placeholder="请输入送仓货件号" />
          </Form.Item>

          <Form.Item
            label="送仓店铺"
            name="delivery_store"
          >
            <Select
              showSearch
              allowClear
              placeholder="请选择送仓店铺"
              optionFilterProp="label"
              options={deliveryStoreOptions}
            />
          </Form.Item>

          <Form.Item label="换标类型" name="relabel_type">
            <Select
              allowClear
              placeholder="请选择换标类型"
              options={relabelTypeOptions.map((item) => ({
                label: item,
                value: item,
              }))}
            />
          </Form.Item>

          <Form.Item label="送仓时间" name="delivery_time">
            <DatePicker className="!w-full" format="YYYY/MM/DD" />
          </Form.Item>
        </div>
      </Form>
    </Drawer>
  );
}
