import { SyncOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Button, DatePicker, Select, Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useEffect, useRef, useState } from "react";

import {
  formatShipmentTrackDate,
  type ShipmentTrackRecord,
} from "../_lib/shipment-tracks";

type ShipmentTrackSearchOption = {
  label: string;
  value: string;
};

type ShipmentTrackDateField = "sailing_time" | "warehouse_arrived_time";

type ShipmentTrackDateChangeHandler = (
  record: ShipmentTrackRecord,
  field: ShipmentTrackDateField,
  value: Dayjs | null,
) => void | Promise<void>;

function renderShipmentTrackSearchTagsInput() {
  return (
    <Select
      mode="tags"
      allowClear
      open={false}
      tokenSeparators={[" ", "\n", "\t", ",", "，"]}
      placeholder="可用回车、空格或逗号分隔"
      className="w-full"
    />
  );
}

function EditableTrackDatePicker({
  disabled,
  field,
  onCancel,
  onChange,
  record,
}: {
  disabled: boolean;
  field: ShipmentTrackDateField;
  onCancel: (record: ShipmentTrackRecord, field: ShipmentTrackDateField) => void;
  onChange: ShipmentTrackDateChangeHandler;
  record: ShipmentTrackRecord;
}) {
  const formattedValue = formatShipmentTrackDate(record[field]);
  const changedRef = useRef(false);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    return () => {
      if (cancelTimerRef.current) {
        clearTimeout(cancelTimerRef.current);
      }
    };
  }, []);

  return (
    <DatePicker
      autoFocus
      open={open}
      size="small"
      className="!w-[128px]"
      format="YYYY/MM/DD"
      allowClear
      disabled={disabled}
      value={formattedValue ? dayjs(formattedValue) : null}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);

        if (nextOpen || disabled) {
          return;
        }

        cancelTimerRef.current = setTimeout(() => {
          cancelTimerRef.current = null;

          if (!changedRef.current) {
            onCancel(record, field);
          }
        }, 0);
      }}
      onChange={(value) => {
        changedRef.current = true;

        if (cancelTimerRef.current) {
          clearTimeout(cancelTimerRef.current);
          cancelTimerRef.current = null;
        }

        void onChange(record, field, value);
      }}
    />
  );
}

export function getShipmentTrackColumns(
  onUpdateTrack: (record: ShipmentTrackRecord) => void,
  onOpenTrackDetails: (record: ShipmentTrackRecord) => void,
  onChangeTrackDate: ShipmentTrackDateChangeHandler,
  onStartTrackDateEdit: (
    record: ShipmentTrackRecord,
    field: ShipmentTrackDateField,
  ) => void,
  onCancelTrackDateEdit: (
    record: ShipmentTrackRecord,
    field: ShipmentTrackDateField,
  ) => void,
  isTrackDateEditing: (
    record: ShipmentTrackRecord,
    field: ShipmentTrackDateField,
  ) => boolean,
  isUpdatingTrack: (record: ShipmentTrackRecord) => boolean,
  canUpdateTrack: (record: ShipmentTrackRecord) => boolean,
  isTrackDateUpdating: (
    record: ShipmentTrackRecord,
    field: ShipmentTrackDateField,
  ) => boolean,
  productSelectOptions: ShipmentTrackSearchOption[],
  logisticsProviderOptions: ShipmentTrackSearchOption[],
): ProColumns<ShipmentTrackRecord>[] {
  return [
    {
      title: "货件号",
      dataIndex: "shipment_no",
      hideInTable: true,
      renderFormItem: renderShipmentTrackSearchTagsInput,
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
      valueType: "select",
      fieldProps: {
        mode: "multiple",
        showSearch: true,
        optionFilterProp: "label",
        placeholder: "请选择产品名称",
        options: productSelectOptions,
      },
      render: (_, record) => record.product_name || "-",
    },
    {
      title: "运单编号",
      dataIndex: "tracking_no",
      hideInTable: true,
      renderFormItem: renderShipmentTrackSearchTagsInput,
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
        placeholder: "请选择物流商",
        options: logisticsProviderOptions,
      },
    },
    {
      title: "是否到仓",
      dataIndex: "warehouse_arrived",
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
      width: 150,
      search: false,
      onCell: (record) => ({
        className: "cursor-pointer",
        onDoubleClick: () => onStartTrackDateEdit(record, "sailing_time"),
      }),
      render: (_, record) => {
        const formattedValue = formatShipmentTrackDate(record.sailing_time);

        if (isTrackDateEditing(record, "sailing_time")) {
          return (
            <EditableTrackDatePicker
              disabled={isTrackDateUpdating(record, "sailing_time")}
              field="sailing_time"
              onCancel={onCancelTrackDateEdit}
              onChange={onChangeTrackDate}
              record={record}
            />
          );
        }

        return (
          <Typography.Text
            className="block min-h-6 whitespace-nowrap"
            type={formattedValue ? undefined : "secondary"}
          >
            {formattedValue || "-"}
          </Typography.Text>
        );
      },
    },
    {
      title: "到仓时间",
      dataIndex: "warehouse_arrived_time",
      valueType: "date",
      width: 150,
      search: false,
      onCell: (record) => ({
        className: "cursor-pointer",
        onDoubleClick: () =>
          onStartTrackDateEdit(record, "warehouse_arrived_time"),
      }),
      render: (_, record) => {
        const formattedValue = formatShipmentTrackDate(
          record.warehouse_arrived_time,
        );

        if (isTrackDateEditing(record, "warehouse_arrived_time")) {
          return (
            <EditableTrackDatePicker
              disabled={isTrackDateUpdating(record, "warehouse_arrived_time")}
              field="warehouse_arrived_time"
              onCancel={onCancelTrackDateEdit}
              onChange={onChangeTrackDate}
              record={record}
            />
          );
        }

        return (
          <Typography.Text
            className="block min-h-6 whitespace-nowrap"
            type={formattedValue ? undefined : "secondary"}
          >
            {formattedValue || "-"}
          </Typography.Text>
        );
      },
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
        const hasSupportedProvider =
          providerName === "赛易" ||
          providerName === "日升辉" ||
          providerName === "通途" ||
          providerName === "唐朝";
        const canUpdate = canUpdateTrack(record);
        const updateDisabledTitle = record.warehouse_arrived_time
          ? "已到仓货件禁止更新轨迹"
          : "当前仅支持赛易/日升辉/通途/唐朝货件更新轨迹";

        return [
          <Tooltip
            key="update-track"
            title={hasSupportedProvider && canUpdate ? "更新轨迹" : updateDisabledTitle}
          >
            <Button
              type="text"
              size="small"
              icon={<SyncOutlined />}
              disabled={!canUpdate}
              loading={isUpdatingTrack(record)}
              onClick={() => onUpdateTrack(record)}
            />
          </Tooltip>,
        ];
      },
    },
  ];
}
