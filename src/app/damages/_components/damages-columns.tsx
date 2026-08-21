import type { ProColumns } from "@ant-design/pro-components";
import { Typography } from "antd";

import { formatDamageDate, type DamageRecord } from "../_lib/damages";

function formatMoney(value?: number | null) {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `¥${amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function getDamageColumns(): ProColumns<DamageRecord>[] {
  return [
    {
      title: "送仓货件",
      dataIndex: "delivery_shipment_no",
      key: "delivery_shipment_no_search",
      hideInTable: true,
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
    },
    {
      title: "送仓店铺",
      dataIndex: "delivery_store",
      width: 115,
      ellipsis: true,
    },
    {
      title: "送仓日期",
      dataIndex: "delivery_date",
      width: 100,
      valueType: "dateRange",
      render: (_, record) => formatDamageDate(record.delivery_date),
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
  ];
}
