import { SyncOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Button, DatePicker, InputNumber, Select, Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useEffect, useRef, useState } from "react";

import {
  formatShipmentTrackDate,
  canEditEstimatedDelivery,
  isValidEstimatedDeliveryDate,
  type ShipmentTrackEditableField,
  type ShipmentTrackRecord,
} from "../_lib/shipment-tracks";

type ShipmentTrackSearchOption = {
  label: string;
  value: string;
};

type ShipmentTrackDateField = Exclude<ShipmentTrackEditableField, "estimated_duration_days">;

type ShipmentTrackDateChangeHandler = (
  record: ShipmentTrackRecord,
  field: ShipmentTrackEditableField,
  value: Dayjs | number | null,
) => void | Promise<void>;

function renderShipmentTrackSearchTagsInput() {
  return (
    <Select
      mode="tags"
      allowClear
      open={false}
      tokenSeparators={[" ", "\n", "\t", ",", "，"]}
      placeholder="可用回车、空格或逗号分隔"
      maxTagCount="responsive"
      maxTagTextLength={18}
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
  onCancel: (record: ShipmentTrackRecord, field: ShipmentTrackEditableField) => void;
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
      disabledDate={field === "estimated_delivery_time"
        ? (date) => !isValidEstimatedDeliveryDate(
            record.estimated_warehouse_arrived_time, date.format("YYYY-MM-DD"),
          )
        : undefined}
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

function EditableEstimatedDuration({
  record, disabled, onChange, onCancel,
}: {
  record: ShipmentTrackRecord;
  disabled: boolean;
  onChange: ShipmentTrackDateChangeHandler;
  onCancel: (record: ShipmentTrackRecord, field: ShipmentTrackEditableField) => void;
}) {
  const [value, setValue] = useState<number | null>(record.estimated_duration_days);
  const submittedRef = useRef(false);
  const save = () => {
    if (disabled || submittedRef.current) return;
    submittedRef.current = true;
    void Promise.resolve(onChange(record, "estimated_duration_days", value))
      .finally(() => { submittedRef.current = false; });
  };

  return (
    <InputNumber<number>
      autoFocus
      aria-label="预计时效天数"
      size="small"
      min={1}
      max={2147483647}
      step={1}
      value={value}
      disabled={disabled}
      onChange={setValue}
      onPressEnter={save}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          submittedRef.current = true;
          onCancel(record, "estimated_duration_days");
        }
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
    field: ShipmentTrackEditableField,
  ) => void,
  onCancelTrackDateEdit: (
    record: ShipmentTrackRecord,
    field: ShipmentTrackEditableField,
  ) => void,
  isTrackDateEditing: (
    record: ShipmentTrackRecord,
    field: ShipmentTrackEditableField,
  ) => boolean,
  isUpdatingTrack: (record: ShipmentTrackRecord) => boolean,
  isTrackDateUpdating: (
    record: ShipmentTrackRecord,
    field: ShipmentTrackEditableField,
  ) => boolean,
  orderStoreOptions: ShipmentTrackSearchOption[],
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
      title: "下单店铺",
      dataIndex: "order_store",
      hideInTable: true,
      valueType: "select",
      fieldProps: {
        mode: "multiple",
        showSearch: true,
        optionFilterProp: "label",
        placeholder: "请选择下单店铺",
        options: orderStoreOptions,
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
      title: "产品数",
      dataIndex: "total_qty",
      valueType: "digit",
      width: 90,
      search: false,
      render: (_, record) => record.total_qty ?? "-",
    },
    {
      title: "店铺",
      dataIndex: "order_store",
      width: 120,
      ellipsis: true,
      search: false,
      render: (_, record) => record.order_store || "-",
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
      width: 200,
      ellipsis: true,
      onCell: () => ({ style: { maxWidth: 200 } }),
      valueType: "select",
      fieldProps: {
        placeholder: "请选择最新轨迹",
        allowClear: true,
        options: [
          { label: "清关中", value: "清关中" },
          { label: "已到仓", value: "已到仓" },
        ],
      },
      render: (_, record) =>
        record.latest_track ? (
          <Typography.Link
            className="!block max-w-[200px] truncate"
            title={record.latest_track}
            onClick={() => onOpenTrackDetails(record)}
          >
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
      title: "预计时效天数",
      dataIndex: "estimated_duration_days",
      width: 150,
      search: false,
      onCell: (record) => ({
        className: "cursor-pointer",
        onDoubleClick: () => onStartTrackDateEdit(record, "estimated_duration_days"),
      }),
      render: (_, record) => isTrackDateEditing(record, "estimated_duration_days") ? (
        <EditableEstimatedDuration
          key={`${record.id}:estimated-duration`}
          record={record}
          disabled={isTrackDateUpdating(record, "estimated_duration_days")}
          onChange={onChangeTrackDate}
          onCancel={onCancelTrackDateEdit}
        />
      ) : (
        <Typography.Text className="block min-h-6 whitespace-nowrap">
          {record.estimated_duration_days == null ? "-" : `${record.estimated_duration_days}天`}
        </Typography.Text>
      ),
    },
    {
      title: "预计到仓时间",
      dataIndex: "estimated_warehouse_arrived_time",
      width: 160,
      search: false,
      render: (_, record) => formatShipmentTrackDate(record.estimated_warehouse_arrived_time) || "-",
    },
    {
      title: "预计送仓时间",
      dataIndex: "estimated_delivery_time",
      width: 160,
      search: false,
      onCell: (record) => ({
        className: canEditEstimatedDelivery(record) ? "cursor-pointer" : undefined,
        onDoubleClick: () => {
          if (canEditEstimatedDelivery(record)) onStartTrackDateEdit(record, "estimated_delivery_time");
        },
      }),
      render: (_, record) => isTrackDateEditing(record, "estimated_delivery_time") && canEditEstimatedDelivery(record) ? (
        <EditableTrackDatePicker
          record={record}
          field="estimated_delivery_time"
          disabled={isTrackDateUpdating(record, "estimated_delivery_time")}
          onChange={onChangeTrackDate}
          onCancel={onCancelTrackDateEdit}
        />
      ) : (
        <Tooltip title="仅清关中且已有预计到仓时间的货件可双击编辑，须至少晚于预计到仓时间2天">
          <Typography.Text className="block min-h-6 whitespace-nowrap">
            {formatShipmentTrackDate(record.estimated_delivery_time) || "-"}
          </Typography.Text>
        </Tooltip>
      ),
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
      title: "创建时间",
      dataIndex: "created_at",
      valueType: "date",
      width: 160,
      search: false,
      sorter: true,
      render: (_, record) =>
        formatShipmentTrackDate(record.created_at) || "-",
    },
    {
      title: "操作",
      valueType: "option",
      width: 90,
      fixed: "right",
      search: false,
      render: (_, record) => [
        <Tooltip key="update-track" title="更新轨迹">
          <Button
            type="text"
            size="small"
            icon={<SyncOutlined />}
            loading={isUpdatingTrack(record)}
            onClick={() => onUpdateTrack(record)}
          />
        </Tooltip>,
      ],
    },
  ];
}
