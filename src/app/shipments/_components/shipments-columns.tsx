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

function openRelabelPage(shipmentNo?: string | null) {
  const trimmedShipmentNo = shipmentNo?.trim();
  if (!trimmedShipmentNo) return;

  const params = new URLSearchParams();
  params.set("original_shipment_no", trimmedShipmentNo);
  window.history.pushState(null, "", `/relabels?${params.toString()}`);
}

function openStorePage(storeName?: string | null) {
  const trimmedStoreName = storeName?.trim();
  if (!trimmedStoreName) return;

  const params = new URLSearchParams();
  params.set("seller_name", trimmedStoreName);
  window.history.pushState(null, "", `/stores?${params.toString()}`);
}

function openLogisticsPage(providerName?: string | null) {
  const trimmedProviderName = providerName?.trim();
  if (!trimmedProviderName) return;

  const params = new URLSearchParams();
  params.set("provider_name", trimmedProviderName);
  window.history.pushState(null, "", `/logistics?${params.toString()}`);
}

export function getShipmentColumns(
  onEdit: (record: ShipmentRecord) => void,
  onDelete: (record: ShipmentRecord) => void,
  onStartDeliveryStatusEdit: (record: ShipmentRecord) => void,
  onCancelDeliveryStatusEdit: () => void,
  onChangeDeliveryStatus: (record: ShipmentRecord, value: string) => void,
  onStartRelabelEdit: (record: ShipmentRecord) => void,
  onCancelRelabelEdit: () => void,
  onChangeRelabel: (record: ShipmentRecord, value: string) => void,
  isDeliveryStatusEditing: (record: ShipmentRecord) => boolean,
  isDeliveryStatusUpdating: (record: ShipmentRecord) => boolean,
  isRelabelEditing: (record: ShipmentRecord) => boolean,
  isRelabelUpdating: (record: ShipmentRecord) => boolean,
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
  const productStoreMap = new Map(
    productOptions
      .filter((item) => item.product_name?.trim())
      .map((item) => [item.product_name!.trim(), item.store_name]),
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
      render: (_, record) => {
        const shipmentNo = record.shipment_no?.trim();
        const copyable = shipmentNo ? { text: shipmentNo } : false;

        if (shipmentNo && record.is_relabel === "是") {
          return (
            <Typography.Link
              className="whitespace-nowrap"
              copyable={copyable}
              onClick={() => openRelabelPage(shipmentNo)}
            >
              {shipmentNo}
            </Typography.Link>
          );
        }

        return (
          <Typography.Text className="whitespace-nowrap" copyable={copyable}>
            {shipmentNo || "-"}
          </Typography.Text>
        );
      },
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

        return storeName ? (
          <Typography.Link onClick={() => openStorePage(storeName)}>
            {storeName}
          </Typography.Link>
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

        return providerName ? (
          <Typography.Link onClick={() => openLogisticsPage(providerName)}>
            {providerName}
          </Typography.Link>
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
      title: "送仓时间",
      dataIndex: "appointment_time",
      valueType: "dateRange",
      width: 120,
      hideInSearch: true,
      render: (_, record) => {
        if (record.is_relabel === "是") {
          const deliveryTimes = record.relabel_delivery_times ?? [];

          return deliveryTimes.length > 0 ? (
            <div className="flex flex-col gap-1">
              {deliveryTimes.map((value) => (
                <Typography.Text key={value} className="whitespace-nowrap">
                  {formatShipmentDate(value)}
                </Typography.Text>
              ))}
            </div>
          ) : (
            ""
          );
        }

        return formatShipmentDate(record.appointment_time);
      },
    },
    {
      title: "是否换标",
      dataIndex: "is_relabel",
      width: 96,
      onCell: (record) => ({
        onDoubleClick: () => {
          if (!isRelabelUpdating(record)) {
            onStartRelabelEdit(record);
          }
        },
      }),
      render: (_, record) => {
        if (isRelabelEditing(record)) {
          return (
            <Select
              autoFocus
              size="small"
              value={record.is_relabel ?? ""}
              className="w-[88px]"
              loading={isRelabelUpdating(record)}
              disabled={isRelabelUpdating(record)}
              options={[
                { label: "空", value: "" },
                { label: "否", value: "否" },
                { label: "是", value: "是" },
              ]}
              onChange={(value) => onChangeRelabel(record, value)}
              onBlur={onCancelRelabelEdit}
            />
          );
        }

        return (
          <span
            className={
              record.is_relabel === "是"
                ? "inline-flex"
                : "inline-flex cursor-pointer"
            }
          >
            <Typography.Text>{record.is_relabel ?? ""}</Typography.Text>
          </span>
        );
      },
      valueEnum: {
        是: { text: "是" },
        否: { text: "否" },
      },
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
          if (!isDeliveryStatusUpdating(record)) {
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
              isDeliveryStatusUpdating(record)
                ? "inline-flex"
                : "inline-flex cursor-pointer"
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
