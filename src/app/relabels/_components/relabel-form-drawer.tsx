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
import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";

import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
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
  logisticsOptions: LogisticsProviderOption[];
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

function normalizeRequiredText(value?: string | null) {
  return value?.trim() ?? "";
}

function normalizeNumberValue(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function calculateRelabelFee({
  boxCount,
  cartonLabelUnitPrice,
  productCount,
  productLabelUnitPrice,
  relabelType,
}: {
  boxCount?: number | null;
  cartonLabelUnitPrice?: number | null;
  productCount?: number | null;
  productLabelUnitPrice?: number | null;
  relabelType?: string | null;
}) {
  const normalizedBoxCount = normalizeNumberValue(boxCount);
  const normalizedCartonPrice = normalizeNumberValue(cartonLabelUnitPrice) ?? 0;
  const normalizedProductCount = normalizeNumberValue(productCount);
  const normalizedProductPrice = normalizeNumberValue(productLabelUnitPrice) ?? 0;

  if (!relabelType || normalizedBoxCount === null) return undefined;

  const cartonFee =
    relabelType === "外箱标" || relabelType === "外箱标及产品标"
      ? normalizedCartonPrice * normalizedBoxCount
      : 0;
  const productFee =
    relabelType === "产品标" || relabelType === "外箱标及产品标"
      ? normalizedProductPrice * (normalizedProductCount ?? 0)
      : 0;

  return Number((cartonFee + productFee).toFixed(2));
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
  logisticsOptions,
  shipmentOptions,
  storeOptions,
  onClose,
  onSaved,
}: RelabelFormDrawerProps) {
  const [form] = Form.useForm<RelabelFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const { message } = App.useApp();
  const selectedOriginalShipmentNo = Form.useWatch("original_shipment_no", form);
  const selectedRelabelType = Form.useWatch("relabel_type", form);
  const selectedBoxCount = Form.useWatch("box_count", form);
  const selectedProductCount = Form.useWatch("product_count", form);
  const shouldShowProductCount =
    Boolean(selectedRelabelType) && selectedRelabelType !== "外箱标";

  const originalShipmentOptions = useMemo(
    () => {
      const shipmentNos = new Set<string>();

      shipmentOptions.forEach((item) => {
        const shipmentNo = item.shipment_no?.trim();
        if (shipmentNo) shipmentNos.add(shipmentNo);
      });

      return Array.from(shipmentNos).map((shipmentNo) => ({
        label: shipmentNo,
        value: shipmentNo,
      }));
    },
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

  const boxCountByShipmentNo = useMemo(() => {
    const nextMap = new Map<string, number>();

    shipmentOptions.forEach((item) => {
      const shipmentNo = item.shipment_no?.trim();
      const boxCount =
        typeof item.box_count === "number" && Number.isFinite(item.box_count)
          ? item.box_count
          : undefined;

      if (shipmentNo && boxCount !== undefined) {
        nextMap.set(shipmentNo, boxCount);
      }
    });

    return nextMap;
  }, [shipmentOptions]);

  const shipmentOptionByShipmentNo = useMemo(() => {
    const nextMap = new Map<string, ShipmentOption>();

    shipmentOptions.forEach((item) => {
      const shipmentNo = item.shipment_no?.trim();
      if (shipmentNo && !nextMap.has(shipmentNo)) {
        nextMap.set(shipmentNo, item);
      }
    });

    return nextMap;
  }, [shipmentOptions]);

  const logisticsOptionByProviderName = useMemo(() => {
    const nextMap = new Map<string, LogisticsProviderOption>();

    logisticsOptions.forEach((item) => {
      const providerName = item.provider_name?.trim();
      if (providerName && !nextMap.has(providerName)) {
        nextMap.set(providerName, item);
      }
    });

    return nextMap;
  }, [logisticsOptions]);

  const selectedShipmentOption = useMemo(() => {
    const shipmentNo = selectedOriginalShipmentNo?.trim();
    return shipmentNo ? shipmentOptionByShipmentNo.get(shipmentNo) : undefined;
  }, [selectedOriginalShipmentNo, shipmentOptionByShipmentNo]);

  const selectedLogisticsOption = useMemo(() => {
    const providerName = selectedShipmentOption?.logistics_provider?.trim();
    return providerName
      ? logisticsOptionByProviderName.get(providerName)
      : undefined;
  }, [logisticsOptionByProviderName, selectedShipmentOption]);
  const selectedPcsPerBox = selectedShipmentOption?.pcs_per_box;
  const selectedCartonLabelUnitPrice =
    selectedLogisticsOption?.carton_label_unit_price;
  const selectedProductLabelUnitPrice =
    selectedLogisticsOption?.product_label_unit_price;

  const originalShipmentBoxCount = useMemo(() => {
    const shipmentNo = selectedOriginalShipmentNo?.trim();
    if (!shipmentNo) return null;

    return boxCountByShipmentNo.get(shipmentNo) ?? null;
  }, [boxCountByShipmentNo, selectedOriginalShipmentNo]);

  const applyDefaultBoxCount = useCallback((shipmentNo?: string | null) => {
    const trimmedShipmentNo = shipmentNo?.trim();
    const nextBoxCount = trimmedShipmentNo
      ? boxCountByShipmentNo.get(trimmedShipmentNo)
      : undefined;

    form.setFields([
      {
        name: "box_count",
        value: nextBoxCount,
      },
    ]);
  }, [boxCountByShipmentNo, form]);

  useEffect(() => {
    if (!open) return;

    const boxCount = normalizeNumberValue(selectedBoxCount);
    const pcsPerBox = normalizeNumberValue(selectedPcsPerBox);
    const nextProductCount =
      selectedRelabelType === "外箱标及产品标" &&
      boxCount !== null &&
      pcsPerBox !== null
        ? boxCount * pcsPerBox
        : undefined;
    const currentProductCount = form.getFieldValue("product_count");
    const nextFields: Array<{
      name: keyof RelabelFormValues;
      value: number | undefined;
    }> = [];

    if (
      selectedRelabelType === "外箱标及产品标" &&
      nextProductCount !== undefined &&
      currentProductCount !== nextProductCount
    ) {
      nextFields.push({ name: "product_count", value: nextProductCount });
    }

    if (
      selectedRelabelType === "外箱标及产品标" &&
      nextProductCount === undefined &&
      currentProductCount !== undefined
    ) {
      nextFields.push({ name: "product_count", value: undefined });
    }

    if (selectedRelabelType === "外箱标" && currentProductCount !== undefined) {
      nextFields.push({ name: "product_count", value: undefined });
    }

    const effectiveProductCount =
      nextFields.find((item) => item.name === "product_count")?.value ??
      selectedProductCount;

    const nextRelabelFee = calculateRelabelFee({
      boxCount: selectedBoxCount,
      cartonLabelUnitPrice: selectedCartonLabelUnitPrice,
      productCount:
        selectedRelabelType === "外箱标" ? null : effectiveProductCount,
      productLabelUnitPrice: selectedProductLabelUnitPrice,
      relabelType: selectedRelabelType,
    });
    const currentRelabelFee = form.getFieldValue("relabel_fee");

    if (currentRelabelFee !== nextRelabelFee) {
      nextFields.push({ name: "relabel_fee", value: nextRelabelFee });
    }

    if (nextFields.length > 0) {
      form.setFields(nextFields);
    }
  }, [
    form,
    open,
    selectedBoxCount,
    selectedCartonLabelUnitPrice,
    selectedPcsPerBox,
    selectedProductCount,
    selectedProductLabelUnitPrice,
    selectedRelabelType,
  ]);

  useEffect(() => {
    if (!open) return;

    if (mode === "edit" && record) {
      const originalShipmentNo = record.original_shipment_no ?? undefined;

      form.setFieldsValue({
        original_shipment_no: originalShipmentNo,
        delivery_store: record.delivery_store ?? undefined,
        delivery_shipment_no: record.delivery_shipment_no ?? undefined,
        box_count: record.box_count ?? undefined,
        product_count: record.product_count ?? undefined,
        relabel_fee: record.relabel_fee ?? undefined,
        relabel_type: record.relabel_type ?? undefined,
        delivery_time: toDateInputValue(record.delivery_time),
        remark: record.remark ?? undefined,
      });

      if (record.box_count === null || record.box_count === undefined) {
        applyDefaultBoxCount(originalShipmentNo);
      }
      return;
    }

    form.setFieldsValue({
      delivery_store: undefined,
      box_count: undefined,
      product_count: undefined,
    });
  }, [applyDefaultBoxCount, form, mode, open, record]);

  const handleFinish: FormProps<RelabelFormValues>["onFinish"] = async (
    values,
  ) => {
    const payload: RelabelUpdateValues = {
      original_shipment_no: normalizeRequiredText(values.original_shipment_no),
      delivery_store: normalizeRequiredText(values.delivery_store),
      delivery_shipment_no: normalizeRequiredText(values.delivery_shipment_no),
      box_count: values.box_count,
      product_count:
        values.relabel_type === "外箱标" ? null : values.product_count,
      relabel_fee: values.relabel_fee,
      relabel_type: normalizeRequiredText(values.relabel_type),
      delivery_time: serializeDate(values.delivery_time),
      remark: values.remark,
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
              placeholder="请选择原货件号"
              optionFilterProp="label"
              options={originalShipmentOptions}
              onChange={(value) => {
                const shipmentNo = typeof value === "string" ? value : undefined;
                applyDefaultBoxCount(shipmentNo);
              }}
            />
          </Form.Item>

          <Form.Item
            label="送仓货件号"
            name="delivery_shipment_no"
            rules={[
              {
                required: true,
                whitespace: true,
                message: "请输入送仓货件号",
              },
            ]}
          >
            <Input placeholder="请输入送仓货件号" />
          </Form.Item>

          <Form.Item
            label="送仓店铺"
            name="delivery_store"
            rules={[{ required: true, message: "请选择送仓店铺" }]}
          >
            <Select
              showSearch
              allowClear
              placeholder="请选择送仓店铺"
              optionFilterProp="label"
              options={deliveryStoreOptions}
            />
          </Form.Item>

          <Form.Item
            label="外箱数"
            name="box_count"
            rules={[
              { required: true, message: "请输入外箱数" },
              {
                validator: async (_, value?: number | null) => {
                  if (value === undefined || value === null) return;
                  if (!Number.isFinite(value) || value <= 0) {
                    throw new Error("外箱数必须大于0");
                  }
                  if (
                    typeof originalShipmentBoxCount === "number" &&
                    value > originalShipmentBoxCount
                  ) {
                    throw new Error(
                      `外箱数不能大于原货件箱数${originalShipmentBoxCount}`,
                    );
                  }
                },
              },
            ]}
          >
            <InputNumber
              className="!w-full"
              min={1}
              precision={0}
              placeholder="请输入外箱数"
            />
          </Form.Item>

          <Form.Item
            label="换标类型"
            name="relabel_type"
            rules={[{ required: true, message: "请选择换标类型" }]}
          >
            <Select
              allowClear
              placeholder="请选择换标类型"
              onChange={(value) => {
                if (value === "外箱标") {
                  form.setFields([{ name: "product_count", value: undefined }]);
                }
              }}
              options={relabelTypeOptions.map((item) => ({
                label: item,
                value: item,
              }))}
            />
          </Form.Item>

          {shouldShowProductCount ? (
            <Form.Item
              label="产品数"
              name="product_count"
              rules={[
                { required: true, message: "请输入产品数" },
                {
                  validator: async (_, value?: number | null) => {
                    if (value === undefined || value === null) return;
                    if (!Number.isFinite(value) || value <= 0) {
                      throw new Error("产品数必须大于0");
                    }
                  },
                },
              ]}
            >
              <InputNumber
                className="!w-full"
                min={1}
                precision={0}
                placeholder="请输入产品数"
              />
            </Form.Item>
          ) : null}

          <Form.Item label="换标费用" name="relabel_fee">
            <InputNumber
              className="!w-full"
              min={0}
              precision={2}
              readOnly
              placeholder="根据换标类型和物流商单价自动计算"
            />
          </Form.Item>

          <Form.Item label="送仓时间" name="delivery_time">
            <DatePicker className="!w-full" format="YYYY/MM/DD" />
          </Form.Item>

          <Form.Item
            className="md:col-span-2"
            label="备注"
            name="remark"
          >
            <Input.TextArea rows={3} placeholder="请输入备注" />
          </Form.Item>
        </div>
      </Form>
    </Drawer>
  );
}
