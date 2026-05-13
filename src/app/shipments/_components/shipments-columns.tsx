import type { ProColumns } from "@ant-design/pro-components";
import { Tag } from "antd";

import {
  formatShipmentDate,
  type ShipmentRecord,
} from "../_lib/shipments";

function StatusText({ value }: { value?: string | null }) {
  if (!value) return <Tag color="default">未记录</Tag>;
  return <Tag color="blue">{value}</Tag>;
}

export const shipmentColumns: ProColumns<ShipmentRecord>[] = [
  {
    title: "下单店铺",
    dataIndex: "order_store",
    width: 120,
    fixed: "left",
    ellipsis: true,
  },
  {
    title: "下单时间",
    dataIndex: "order_time",
    valueType: "dateRange",
    width: 120,
    render: (_, record) => formatShipmentDate(record.order_time),
  },
  {
    title: "物流",
    dataIndex: "logistics_provider",
    width: 100,
    ellipsis: true,
  },
  {
    title: "货件号",
    dataIndex: "shipment_no",
    width: 130,
    copyable: true,
  },
  {
    title: "物流单号",
    dataIndex: "tracking_no",
    width: 170,
    copyable: true,
    ellipsis: true,
  },
  {
    title: "产品名称",
    dataIndex: "product_name",
    width: 180,
    ellipsis: true,
  },
  {
    title: "箱数",
    dataIndex: "box_count",
    valueType: "digit",
    width: 90,
    search: false,
  },
  {
    title: "装箱数",
    dataIndex: "pcs_per_box",
    valueType: "digit",
    width: 100,
    search: false,
  },
  {
    title: "单产品总数",
    dataIndex: "total_qty",
    valueType: "digit",
    width: 120,
    search: false,
  },
  {
    title: "到海外仓时间",
    dataIndex: "overseas_warehouse_arrived_at",
    valueType: "dateRange",
    width: 140,
    render: (_, record) =>
      formatShipmentDate(record.overseas_warehouse_arrived_at),
  },
  {
    title: "新货件号",
    dataIndex: "new_shipment_no",
    width: 130,
    copyable: true,
    ellipsis: true,
  },
  {
    title: "约仓时间",
    dataIndex: "appointment_time",
    valueType: "dateRange",
    width: 120,
    render: (_, record) => formatShipmentDate(record.appointment_time),
  },
  {
    title: "指令提交",
    dataIndex: "instruction_submitted",
    width: 160,
    render: (_, record) => <StatusText value={record.instruction_submitted} />,
  },
  {
    title: "单个头程费用",
    dataIndex: "first_leg_unit_cost",
    valueType: "money",
    width: 130,
    search: false,
  },
  {
    title: "头程单批次运费",
    dataIndex: "first_leg_batch_fee",
    valueType: "money",
    width: 140,
    search: false,
  },
  {
    title: "头程结算",
    dataIndex: "first_leg_fee_settled",
    width: 160,
    render: (_, record) => <StatusText value={record.first_leg_fee_settled} />,
  },
  {
    title: "工厂月结",
    dataIndex: "factory_monthly_settled",
    width: 160,
    render: (_, record) => (
      <StatusText value={record.factory_monthly_settled} />
    ),
  },
  {
    title: "货物价值",
    dataIndex: "goods_value",
    valueType: "money",
    width: 120,
    search: false,
  },
  {
    title: "换标费核对",
    dataIndex: "relabel_fee_checked",
    width: 180,
    render: (_, record) => <StatusText value={record.relabel_fee_checked} />,
  },
];
