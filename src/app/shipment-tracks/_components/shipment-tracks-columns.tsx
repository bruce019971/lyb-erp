import { SyncOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Button, Select, Tooltip, Typography } from "antd";

import type { ShipmentOption } from "../../shipments/_lib/shipments";
import {
  formatShipmentTrackDate,
  type ShipmentTrackRecord,
} from "../_lib/shipment-tracks";

const TOKEN_SEPARATORS = [" ", "\n", "\r", "\t", ",", "，"];

export function getShipmentTrackColumns(
  shipmentOptions: ShipmentOption[],
  onUpdateTrack: (record: ShipmentTrackRecord) => void,
  onOpenTrackDetails: (record: ShipmentTrackRecord) => void,
  isUpdatingTrack: (record: ShipmentTrackRecord) => boolean,
): ProColumns<ShipmentTrackRecord>[] {
  const shipmentSelectOptions = Array.from(
    new Set(
      shipmentOptions
        .map((item) => item.shipment_no?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  ).map((value) => ({
    label: value,
    value,
  }));
  const trackingSelectOptions = Array.from(
    new Set(
      shipmentOptions
        .map((item) => item.tracking_no?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  ).map((value) => ({
    label: value,
    value,
  }));
  const productSelectOptions = Array.from(
    new Set(
      shipmentOptions
        .map((item) => item.product_name?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  ).map((value) => ({
    label: value,
    value,
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
            copyable={record.shipment_no ? { text: record.shipment_no } : false}
          >
            {record.shipment_no || "-"}
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
      width: 180,
      ellipsis: true,
      renderFormItem: () => (
        <Select
          mode="multiple"
          showSearch
          allowClear
          optionFilterProp="label"
          placeholder="请选择产品名称"
          options={productSelectOptions}
        />
      ),
      render: (_, record) => record.product_name || "-",
    },
    {
      title: "最新轨迹",
      dataIndex: "latest_track",
      width: 300,
      ellipsis: true,
      search: false,
      render: (_, record) =>
        record.latest_track ? (
          <Typography.Link onClick={() => onOpenTrackDetails(record)}>
            {record.latest_track}
          </Typography.Link>
        ) : (
          "-"
        ),
    },
    {
      title: "开船时间",
      dataIndex: "sailing_time",
      valueType: "date",
      width: 120,
      search: false,
      render: (_, record) => formatShipmentTrackDate(record.sailing_time) || "-",
    },
    {
      title: "到仓时间",
      dataIndex: "warehouse_arrived_time",
      valueType: "date",
      width: 120,
      search: false,
      render: (_, record) =>
        formatShipmentTrackDate(record.warehouse_arrived_time) || "-",
    },
    {
      title: "时效天数",
      dataIndex: "duration_days",
      valueType: "digit",
      width: 110,
      search: false,
      render: (_, record) =>
        record.duration_days == null ? "-" : `${record.duration_days}天`,
    },
    {
      title: "轨迹更新时间",
      dataIndex: "track_updated_at",
      valueType: "date",
      width: 160,
      search: false,
      sorter: true,
      render: (_, record) =>
        formatShipmentTrackDate(record.track_updated_at) || "-",
    },
    {
      title: "操作",
      valueType: "option",
      width: 90,
      fixed: "right",
      search: false,
      render: (_, record) => {
        const providerName = record.logistics_provider?.trim();
        const canUpdateTrack =
          providerName === "赛易" || providerName === "日升辉";

        return [
          <Tooltip
            key="update-track"
            title={
              canUpdateTrack
                ? "更新轨迹"
                : "当前仅支持赛易/日升辉货件更新轨迹"
            }
          >
            <Button
              type="text"
              size="small"
              icon={<SyncOutlined />}
              disabled={!canUpdateTrack}
              loading={isUpdatingTrack(record)}
              onClick={() => onUpdateTrack(record)}
            />
          </Tooltip>,
        ];
      },
    },
  ];
}
