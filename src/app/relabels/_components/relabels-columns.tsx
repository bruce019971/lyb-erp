import type { ProColumns } from "@ant-design/pro-components";
import { Button, Select, Tag, Typography } from "antd";

import {
  canEditRelabelDeliveryStatus,
  formatRelabelDate,
  isRelabelAlert,
  relabelTypeOptions,
  type RelabelRecord,
} from "../_lib/relabels";

function StatusTag({
  value,
  positiveColor = "green",
}: {
  value?: string | null;
  positiveColor?: string;
}) {
  if (value === "是") return <Tag color={positiveColor}>是</Tag>;
  if (value === "否") return <Tag>否</Tag>;
  return <span />;
}

function RelabelTypeTag({ value }: { value?: string | null }) {
  if (!value) return <span />;

  if (value === "外箱标") return <Tag color="blue">{value}</Tag>;
  if (value === "产品标") return <Tag color="purple">{value}</Tag>;
  return <Tag color="orange">{value}</Tag>;
}

export function getRelabelColumns(
  onEdit: (record: RelabelRecord) => void,
  onChangeInstructionSubmitted: (record: RelabelRecord, value: string) => void,
  onChangeDeliveryStatus: (record: RelabelRecord, value: string) => void,
  isStatusUpdating: (
    record: RelabelRecord,
    field: "instruction_submitted" | "delivery_status",
  ) => boolean,
): ProColumns<RelabelRecord>[] {
  return [
    {
      title: "原货件号",
      dataIndex: "original_shipment_no",
      width: 180,
      fixed: "left",
      render: (_, record) => (
        <Typography.Text
          className="whitespace-nowrap"
          copyable={
            record.original_shipment_no
              ? { text: record.original_shipment_no }
              : false
          }
        >
          {record.original_shipment_no ?? ""}
        </Typography.Text>
      ),
    },
    {
      title: "送仓货件号",
      dataIndex: "delivery_shipment_no",
      width: 180,
      render: (_, record) => (
        <Typography.Text
          className="whitespace-nowrap"
          copyable={
            record.delivery_shipment_no
              ? { text: record.delivery_shipment_no }
              : false
          }
        >
          {record.delivery_shipment_no ?? ""}
        </Typography.Text>
      ),
    },
    {
      title: "换标类型",
      dataIndex: "relabel_type",
      width: 180,
      render: (_, record) => <RelabelTypeTag value={record.relabel_type} />,
      valueEnum: Object.fromEntries(
        relabelTypeOptions.map((item) => [item, { text: item }]),
      ),
    },
    {
      title: "是否提交指令",
      dataIndex: "instruction_submitted",
      width: 140,
      render: (_, record) =>
        record.instruction_submitted === "是" ? (
          <StatusTag value={record.instruction_submitted} />
        ) : (
          <div className="flex flex-col gap-1">
            <Select
              size="small"
              value="否"
              className="w-[88px]"
              loading={isStatusUpdating(record, "instruction_submitted")}
              disabled={isStatusUpdating(record, "instruction_submitted")}
              options={[
                { label: "否", value: "否" },
                { label: "是", value: "是" },
              ]}
              onChange={(value) => onChangeInstructionSubmitted(record, value)}
            />
            {isRelabelAlert(record) ? (
              <Typography.Text type="danger" className="text-xs">
                指令尚未提交
              </Typography.Text>
            ) : null}
          </div>
        ),
      valueEnum: {
        是: { text: "是" },
        否: { text: "否" },
      },
    },
    {
      title: "送仓状态",
      dataIndex: "delivery_status",
      width: 140,
      render: (_, record) =>
        record.delivery_status === "是" || !canEditRelabelDeliveryStatus(record) ? (
          <StatusTag value={record.delivery_status} positiveColor="cyan" />
        ) : (
          <Select
            size="small"
            value="否"
            className="w-[88px]"
            loading={isStatusUpdating(record, "delivery_status")}
            disabled={isStatusUpdating(record, "delivery_status")}
            options={[
              { label: "否", value: "否" },
              { label: "是", value: "是" },
            ]}
            onChange={(value) => onChangeDeliveryStatus(record, value)}
          />
        ),
      valueEnum: {
        是: { text: "是" },
        否: { text: "否" },
      },
    },
    {
      title: "送仓时间",
      dataIndex: "delivery_time",
      width: 140,
      render: (_, record) => formatRelabelDate(record.delivery_time),
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
