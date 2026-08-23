import { DeleteOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Button, Tooltip, Typography } from "antd";

import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import {
  formatDamageDate,
  type DamageRecord,
  type DamageShipmentOption,
} from "../_lib/damages";

function formatMoney(value?: number | null) {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `¥${amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildSelectOptions(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((item) => item?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  )
    .sort((left, right) => left.localeCompare(right, "zh-CN"))
    .map((item) => ({ label: item, value: item }));
}

export function getDamageColumns(
  shipmentOptions: DamageShipmentOption[],
  logisticsOptions: LogisticsProviderOption[],
  onDelete: (record: DamageRecord) => void,
  isDeleting: (record: DamageRecord) => boolean,
): ProColumns<DamageRecord>[] {
  const shipmentSelectOptions = buildSelectOptions(
    shipmentOptions.map((item) => item.delivery_shipment_no),
  );
  const productSelectOptions = buildSelectOptions(
    shipmentOptions.map((item) => item.product_name),
  );
  const storeSelectOptions = buildSelectOptions(
    shipmentOptions.map((item) => item.delivery_store),
  );
  const logisticsSelectOptions = buildSelectOptions(
    logisticsOptions.map((item) => item.provider_name),
  );

  return [
    {
      title: "送仓货件",
      dataIndex: "delivery_shipment_no",
      key: "delivery_shipment_no_search",
      hideInTable: true,
      valueType: "select",
      fieldProps: {
        mode: "multiple",
        showSearch: true,
        optionFilterProp: "label",
        maxTagCount: "responsive",
        placeholder: "请选择送仓货件",
        options: shipmentSelectOptions,
      },
    },
    {
      title: "送仓货件/运单编号",
      dataIndex: "delivery_shipment_no",
      key: "delivery_shipment_no_display",
      width: 190,
      fixed: "left",
      search: false,
      render: (_, record) => (
        <div className="flex min-w-[160px] flex-col gap-1 whitespace-nowrap">
          <Typography.Text copyable={{ text: record.delivery_shipment_no }}>
            {record.delivery_shipment_no}
          </Typography.Text>
          <Typography.Text
            copyable={record.tracking_no ? { text: record.tracking_no } : false}
            type={record.tracking_no ? undefined : "secondary"}
          >
            {record.tracking_no || "-"}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: "产品名称",
      dataIndex: "product_name",
      width: 105,
      ellipsis: true,
      valueType: "select",
      fieldProps: {
        mode: "multiple",
        showSearch: true,
        optionFilterProp: "label",
        maxTagCount: "responsive",
        placeholder: "请选择产品名称",
        options: productSelectOptions,
      },
    },
    {
      title: "送仓店铺",
      dataIndex: "delivery_store",
      width: 115,
      ellipsis: true,
      valueType: "select",
      fieldProps: {
        mode: "multiple",
        showSearch: true,
        optionFilterProp: "label",
        maxTagCount: "responsive",
        placeholder: "请选择送仓店铺",
        options: storeSelectOptions,
      },
    },
    {
      title: "送仓日期",
      dataIndex: "delivery_date",
      width: 100,
      valueType: "dateRange",
      render: (_, record) => formatDamageDate(record.delivery_date),
    },
    {
      title: "物流商",
      dataIndex: "logistics_provider",
      hideInTable: true,
      valueType: "select",
      fieldProps: {
        mode: "multiple",
        showSearch: true,
        optionFilterProp: "label",
        maxTagCount: "responsive",
        placeholder: "请选择物流商",
        options: logisticsSelectOptions,
      },
    },
    {
      title: "产品数量",
      dataIndex: "product_count",
      width: 80,
      search: false,
      align: "right",
    },
    {
      title: "货损数量",
      dataIndex: "damage_count",
      width: 80,
      search: false,
      align: "right",
    },
    {
      title: "产品价值",
      dataIndex: "product_value",
      width: 100,
      search: false,
      align: "right",
      sorter: true,
      render: (_, record) => formatMoney(record.product_value),
    },
    {
      title: "运费价值",
      dataIndex: "freight_value",
      width: 100,
      search: false,
      align: "right",
      sorter: true,
      render: (_, record) => formatMoney(record.freight_value),
    },
    {
      title: "总价值",
      dataIndex: "total_value",
      width: 100,
      fixed: "right",
      search: false,
      align: "right",
      sorter: true,
      render: (_, record) => (
        <Typography.Text strong>{formatMoney(record.total_value)}</Typography.Text>
      ),
    },
    {
      title: "操作",
      key: "actions",
      valueType: "option",
      width: 56,
      fixed: "right",
      search: false,
      render: (_, record) => [
        <Tooltip key="delete" title="删除">
          <Button
            type="text"
            size="small"
            danger
            aria-label="删除货损记录"
            icon={<DeleteOutlined />}
            loading={isDeleting(record)}
            onClick={() => onDelete(record)}
          />
        </Tooltip>,
      ],
    },
  ];
}
