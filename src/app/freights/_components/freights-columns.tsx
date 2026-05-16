import type { ProColumns } from "@ant-design/pro-components";
import { Button, Tag, Typography } from "antd";

import type { FreightRecord } from "../_lib/freights";

function PaymentTag({ value }: { value?: string | null }) {
  if (value === "是") {
    return <Tag className="border-emerald-200 bg-emerald-50 text-emerald-700">是</Tag>;
  }

  if (value === "否") {
    return <Tag>否</Tag>;
  }

  return <span />;
}

export function getFreightColumns(
  onEdit: (record: FreightRecord) => void,
): ProColumns<FreightRecord>[] {
  return [
    {
      title: "货件号",
      dataIndex: "shipment_no",
      width: 180,
      fixed: "left",
      render: (_, record) => (
        <Typography.Text
          className="whitespace-nowrap"
          copyable={record.shipment_no ? { text: record.shipment_no } : false}
        >
          {record.shipment_no ?? ""}
        </Typography.Text>
      ),
    },
    {
      title: "物流商",
      dataIndex: "logistics_provider",
      width: 160,
      ellipsis: true,
    },
    {
      title: "产品名称",
      dataIndex: "product_name",
      width: 200,
      ellipsis: true,
    },
    {
      title: "运费单价",
      dataIndex: "freight_unit_price",
      valueType: "money",
      width: 140,
      search: false,
    },
    {
      title: "方数/CBM",
      dataIndex: "volume",
      valueType: "digit",
      width: 120,
      search: false,
    },
    {
      title: "总费用",
      dataIndex: "total_fee",
      valueType: "money",
      width: 140,
      search: false,
    },
    {
      title: "单个运费",
      dataIndex: "unit_fee",
      valueType: "money",
      width: 140,
      search: false,
    },
    {
      title: "是否支付",
      dataIndex: "freight_paid_status",
      width: 120,
      render: (_, record) => <PaymentTag value={record.freight_paid_status} />,
      valueEnum: {
        是: { text: "是" },
        否: { text: "否" },
      },
    },
    {
      title: "操作",
      valueType: "option",
      width: 96,
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
