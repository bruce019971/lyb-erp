import { EditOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Button, Tag, Tooltip, Typography } from "antd";

import type { FreightRecord } from "../_lib/freights";
import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import type { ShipmentOption } from "../../shipments/_lib/shipments";

const TOKEN_SEPARATORS = [" ", "\n", "\r", "\t", ",", "，"];

function PaymentTag({ value }: { value?: string | null }) {
  if (value === "是") {
    return <Tag className="border-[#b7eb8f] bg-[#f6ffed] text-[#389e0d]">是</Tag>;
  }

  if (value === "否") {
    return <Tag>否</Tag>;
  }

  return <span />;
}

export function getFreightColumns(
  onEdit: (record: FreightRecord) => void,
  shipmentOptions: ShipmentOption[],
  logisticsOptions: LogisticsProviderOption[],
): ProColumns<FreightRecord>[] {
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
  const trackingSelectOptions = Array.from(
    new Set(
      shipmentOptions
        .map((item) => item.tracking_no?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  ).map((item) => ({
    label: item,
    value: item,
  }));
  const productSelectOptions = Array.from(
    new Set(
      shipmentOptions
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

  return [
    {
      title: "货件号",
      dataIndex: "shipment_no",
      valueType: "select",
      hideInTable: true,
      fieldProps: {
        mode: "tags",
        showSearch: true,
        optionFilterProp: "label",
        tokenSeparators: TOKEN_SEPARATORS,
        placeholder: "可粘贴多个货件号",
        options: shipmentSelectOptions,
      },
    },
    {
      title: "运单编号",
      dataIndex: "tracking_no",
      valueType: "select",
      hideInTable: true,
      fieldProps: {
        mode: "tags",
        showSearch: true,
        optionFilterProp: "label",
        tokenSeparators: TOKEN_SEPARATORS,
        placeholder: "可粘贴多个运单编号",
        options: trackingSelectOptions,
      },
    },
    {
      title: "货件号/运单编号",
      dataIndex: "shipment_no",
      width: 190,
      fixed: "left",
      search: false,
      render: (_, record) => (
        <div className="flex min-w-[160px] flex-col gap-1 whitespace-nowrap">
          <Typography.Text
            className="whitespace-nowrap"
            copyable={record.shipment_no ? { text: record.shipment_no } : false}
          >
            {record.shipment_no ?? ""}
          </Typography.Text>
          <Typography.Text
            className="whitespace-nowrap"
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
      width: 180,
      fixed: "left",
      ellipsis: true,
      valueType: "select",
      fieldProps: {
        mode: "tags",
        showSearch: true,
        optionFilterProp: "label",
        tokenSeparators: TOKEN_SEPARATORS,
        placeholder: "可粘贴多个产品名称",
        options: productSelectOptions,
      },
    },
    {
      title: "物流商",
      dataIndex: "logistics_provider",
      width: 160,
      ellipsis: true,
      valueType: "select",
      fieldProps: {
        mode: "multiple",
        showSearch: true,
        optionFilterProp: "label",
        placeholder: "请选择物流商",
        options: logisticsSelectOptions,
      },
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
      title: "额外费用",
      dataIndex: "extra_fee",
      valueType: "money",
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
      title: "货件箱数",
      dataIndex: "box_count",
      valueType: "digit",
      width: 120,
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
      width: 64,
      fixed: "right",
      search: false,
      render: (_, record) => (
        <Tooltip title="编辑">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => onEdit(record)}
          />
        </Tooltip>
      ),
    },
  ];
}
