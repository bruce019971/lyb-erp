import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Button, Select, Tooltip, Typography } from "antd";

import {
  canEditShipmentDeliveryStatus,
  formatShipmentDate,
  isShipmentDeliveryOverdue,
  type ShipmentRecord,
} from "../_lib/shipments";
import type { ShipmentOption } from "../_lib/shipments";
import type { ProductShipmentOption } from "../../products/_lib/products";
import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import type { StoreOption } from "../../stores/_lib/stores";

function getExternalHref(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function openProductPage(
  productName?: string | null,
  storeName?: string | null,
  logisticsProvider?: string | null,
) {
  const params = new URLSearchParams();

  const trimmedProductName = productName?.trim();
  const trimmedStoreName = storeName?.trim();
  const trimmedLogisticsProvider = logisticsProvider?.trim();

  if (trimmedProductName) {
    params.set("product_name", trimmedProductName);
  }

  if (trimmedStoreName) {
    params.set("store_name", trimmedStoreName);
  }

  if (trimmedLogisticsProvider) {
    params.set("logistics_provider", trimmedLogisticsProvider);
  }

  const href = params.size ? `/products?${params.toString()}` : "/products";
  window.history.pushState(null, "", href);
}

export function getShipmentColumns(
  onEdit: (record: ShipmentRecord) => void,
  onDelete: (record: ShipmentRecord) => void,
  onStartDeliveryStatusEdit: (record: ShipmentRecord) => void,
  onCancelDeliveryStatusEdit: () => void,
  onChangeDeliveryStatus: (record: ShipmentRecord, value: string) => void,
  isDeliveryStatusEditing: (record: ShipmentRecord) => boolean,
  isDeliveryStatusUpdating: (record: ShipmentRecord) => boolean,
  isDeleting: (record: ShipmentRecord) => boolean,
  shipmentOptions: ShipmentOption[],
  storeOptions: StoreOption[],
  productOptions: ProductShipmentOption[],
  logisticsOptions: LogisticsProviderOption[],
): ProColumns<ShipmentRecord>[] {
  function DeliveryStatusTag({
    value,
  }: {
    value?: string | null;
  }) {
    return <Typography.Text>{value || ""}</Typography.Text>;
  }

  const shipmentSelectOptions = Array.from(
    new Set(
      shipmentOptions
        .map((item) => item.shipment_no?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  ).map((item) => ({
    label: item,
    value: item,
  }));
  const storeSelectOptions = Array.from(
    new Set(
      storeOptions
        .map((item) => item.seller_name?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  ).map((item) => ({
    label: item,
    value: item,
  }));
  const productSelectOptions = Array.from(
    new Set(
      productOptions
        .map((item) => item.product_name?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  ).map((item) => ({
    label: item,
    value: item,
  }));
  const logisticsSelectOptions = Array.from(
    new Set(
      logisticsOptions
        .map((item) => item.provider_name?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  ).map((item) => ({
    label: item,
    value: item,
  }));
  const storeAddressMap = new Map(
    storeOptions
      .filter((item) => item.seller_name?.trim())
      .map((item) => [item.seller_name.trim(), item.seller_address]),
  );
  const productStoreMap = new Map(
    productOptions
      .filter((item) => item.product_name?.trim())
      .map((item) => [item.product_name!.trim(), item.store_name]),
  );
  const logisticsUrlMap = new Map(
    logisticsOptions
      .filter((item) => item.provider_name?.trim())
      .map((item) => [item.provider_name!.trim(), item.system_url]),
  );

  return [
    {
      title: "货件号",
      dataIndex: "shipment_no",
      hideInTable: true,
      valueType: "select",
      fieldProps: {
        mode: "multiple",
        showSearch: true,
        optionFilterProp: "label",
        placeholder: "请选择货件号",
        options: shipmentSelectOptions,
      },
    },
    {
      title: "货件号",
      dataIndex: "shipment_no",
      width: 84,
      fixed: "left",
      search: false,
      render: (_, record) => (
        <Typography.Text
          className="whitespace-nowrap"
          copyable={record.shipment_no ? { text: record.shipment_no } : false}
        >
          {record.shipment_no ?? "-"}
        </Typography.Text>
      ),
    },
    {
      title: "产品名称",
      dataIndex: "product_name",
      width: 104,
      fixed: "left",
      ellipsis: true,
      valueType: "select",
      fieldProps: {
        mode: "multiple",
        showSearch: true,
        optionFilterProp: "label",
        placeholder: "请选择产品名称",
        options: productSelectOptions,
      },
      render: (_, record) => {
        const productName = record.product_name?.trim();
        const storeName = record.order_store?.trim();
        const logisticsProvider = record.logistics_provider?.trim();

        return productName ? (
          <Typography.Link
            onClick={() =>
              openProductPage(productName, storeName, logisticsProvider)
            }
          >
            {productName}
          </Typography.Link>
        ) : (
          "-"
        );
      },
    },
    {
      title: "下单店铺",
      dataIndex: "order_store",
      width: 88,
      ellipsis: true,
      valueType: "select",
      fieldProps: {
        mode: "multiple",
        showSearch: true,
        optionFilterProp: "label",
        placeholder: "请选择下单店铺",
        options: storeSelectOptions,
      },
      render: (_, record) => {
        const productName = record.product_name?.trim();
        const storeName =
          record.order_store?.trim() ||
          (productName ? productStoreMap.get(productName)?.trim() : undefined);
        const href = getExternalHref(
          storeName ? storeAddressMap.get(storeName) : undefined,
        );

        return storeName ? (
          href ? (
            <Typography.Link href={href} target="_blank">
              {storeName}
            </Typography.Link>
          ) : (
            storeName
          )
        ) : (
          "-"
        );
      },
    },
    {
      title: "物流商",
      dataIndex: "logistics_provider",
      width: 88,
      ellipsis: true,
      valueType: "select",
      fieldProps: {
        mode: "multiple",
        showSearch: true,
        optionFilterProp: "label",
        placeholder: "请选择物流商",
        options: logisticsSelectOptions,
      },
      render: (_, record) => {
        const providerName = record.logistics_provider?.trim();
        const href = getExternalHref(
          providerName ? logisticsUrlMap.get(providerName) : undefined,
        );

        return providerName ? (
          href ? (
            <Typography.Link href={href} target="_blank">
              {providerName}
            </Typography.Link>
          ) : (
            providerName
          )
        ) : (
          "-"
        );
      },
    },
    {
      title: "箱数",
      dataIndex: "box_count",
      valueType: "digit",
      width: 62,
      search: false,
    },
    {
      title: "装箱数",
      dataIndex: "pcs_per_box",
      valueType: "digit",
      width: 72,
      search: false,
    },
    {
      title: "产品总数",
      dataIndex: "total_qty",
      valueType: "digit",
      width: 72,
      search: false,
    },
    {
      title: "是否到仓",
      dataIndex: "warehouse_arrived_status",
      hideInTable: true,
      valueType: "select",
      fieldProps: {
        placeholder: "请选择是否到仓",
        options: [
          { label: "是", value: "是" },
          { label: "否", value: "否" },
        ],
      },
    },
    {
      title: "到仓时间",
      dataIndex: "overseas_warehouse_arrived_at",
      valueType: "dateRange",
      width: 88,
      hideInSearch: true,
      render: (_, record) =>
        formatShipmentDate(record.overseas_warehouse_arrived_at),
    },
    {
      title: "约仓时间",
      dataIndex: "appointment_time",
      valueType: "dateRange",
      width: 88,
      hideInSearch: true,
      render: (_, record) => formatShipmentDate(record.appointment_time),
    },
    {
      title: "是否送仓",
      dataIndex: "delivery_status",
      width: 104,
      onCell: (record) => ({
        className:
          record.delivery_status === "是"
            ? "shipment-delivery-done-cell"
            : isShipmentDeliveryOverdue(record)
              ? "shipment-delivery-overdue-cell"
              : undefined,
        onDoubleClick: () => {
          if (canEditShipmentDeliveryStatus(record)) {
            onStartDeliveryStatusEdit(record);
          }
        },
      }),
      render: (_, record) => {
        if (isDeliveryStatusEditing(record)) {
          return (
            <Select
              autoFocus
              size="small"
              value={record.delivery_status ?? "否"}
              className="w-[88px]"
              loading={isDeliveryStatusUpdating(record)}
              disabled={isDeliveryStatusUpdating(record)}
              options={[
                { label: "否", value: "否" },
                { label: "是", value: "是" },
              ]}
              onChange={(value) => onChangeDeliveryStatus(record, value)}
              onBlur={onCancelDeliveryStatusEdit}
            />
          );
        }

        return (
          <span
            className={
              canEditShipmentDeliveryStatus(record)
                ? "inline-flex cursor-pointer"
                : "inline-flex"
            }
          >
            <DeliveryStatusTag
              value={record.delivery_status ?? "否"}
            />
          </span>
        );
      },
      valueEnum: {
        是: { text: "是" },
        否: { text: "否" },
      },
    },
    {
      title: "货物价值",
      dataIndex: "goods_value",
      valueType: "money",
      width: 86,
      search: false,
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      valueType: "dateRange",
      width: 88,
      hideInSearch: true,
      render: (_, record) => formatShipmentDate(record.created_at),
    },
    {
      title: "操作",
      valueType: "option",
      width: 84,
      fixed: "right",
      search: false,
      render: (_, record) => [
        <Tooltip key="edit" title="编辑">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => onEdit(record)}
          />
        </Tooltip>,
        <Tooltip key="delete" title="删除">
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            loading={isDeleting(record)}
            onClick={() => onDelete(record)}
          />
        </Tooltip>,
      ],
    },
  ];
}
