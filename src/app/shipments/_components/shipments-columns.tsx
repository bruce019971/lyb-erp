import type { ProColumns } from "@ant-design/pro-components";
import { Button, Typography } from "antd";

import { formatShipmentDate, type ShipmentRecord } from "../_lib/shipments";
import type { ProductShipmentOption } from "../../products/_lib/products";
import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import type { StoreOption } from "../../stores/_lib/stores";

function getExternalHref(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function getShipmentColumns(
  onEdit: (record: ShipmentRecord) => void,
  storeOptions: StoreOption[],
  productOptions: ProductShipmentOption[],
  logisticsOptions: LogisticsProviderOption[],
): ProColumns<ShipmentRecord>[] {
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
      width: 96,
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
      title: "下单店铺",
      dataIndex: "order_store",
      width: 96,
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
      width: 96,
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
      title: "产品名称",
      dataIndex: "product_name",
      width: 140,
      ellipsis: true,
      valueType: "select",
      fieldProps: {
        mode: "multiple",
        showSearch: true,
        optionFilterProp: "label",
        placeholder: "请选择产品名称",
        options: productSelectOptions,
      },
    },
    {
      title: "箱数",
      dataIndex: "box_count",
      valueType: "digit",
      width: 72,
      search: false,
    },
    {
      title: "装箱数(pcs/箱）",
      dataIndex: "pcs_per_box",
      valueType: "digit",
      width: 80,
      search: false,
    },
    {
      title: "产品总数",
      dataIndex: "total_qty",
      valueType: "digit",
      width: 84,
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
      width: 100,
      render: (_, record) =>
        formatShipmentDate(record.overseas_warehouse_arrived_at),
    },
    {
      title: "送仓时间",
      dataIndex: "appointment_time",
      valueType: "dateRange",
      width: 100,
      render: (_, record) => formatShipmentDate(record.appointment_time),
    },
    {
      title: "货物价值",
      dataIndex: "goods_value",
      valueType: "money",
      width: 96,
      search: false,
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      valueType: "dateRange",
      width: 100,
      hideInSearch: true,
      render: (_, record) => formatShipmentDate(record.created_at),
    },
    {
      title: "操作",
      valueType: "option",
      width: 72,
      fixed: "right",
      search: false,
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => onEdit(record)}>
          编辑
        </Button>
      ),
    },
  ];
}
