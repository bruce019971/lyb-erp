import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Button, Select, Tag, Tooltip, Typography } from "antd";

import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import {
  canEditRelabelDeliveryStatus,
  formatRelabelDate,
  relabelTypeOptions,
  type RelabelRecord,
} from "../_lib/relabels";

const TOKEN_SEPARATORS = [" ", "\n", "\r", "\t", ",", "，"];

function RelabelTypeTag({ value }: { value?: string | null }) {
  if (!value) return <span />;

  if (value === "外箱标") return <Tag color="blue">{value}</Tag>;
  if (value === "产品标") return <Tag color="purple">{value}</Tag>;
  return <Tag color="orange">{value}</Tag>;
}

function openShipmentPage(shipmentNo?: string | null) {
  const trimmedShipmentNo = shipmentNo?.trim();
  if (!trimmedShipmentNo) return;

  const params = new URLSearchParams();
  params.set("shipment_no", trimmedShipmentNo);
  window.history.pushState(null, "", `/shipments?${params.toString()}`);
}

function renderShipmentNoSearchInput() {
  return (
    <Select
      mode="tags"
      allowClear
      open={false}
      tokenSeparators={TOKEN_SEPARATORS}
      placeholder="可用回车、空格或逗号分隔"
      className="w-full"
    />
  );
}

export function getRelabelColumns(
  onEdit: (record: RelabelRecord) => void,
  onDelete: (record: RelabelRecord) => void,
  onStartDeliveryStatusEdit: (record: RelabelRecord) => void,
  onCancelDeliveryStatusEdit: () => void,
  onChangeDeliveryStatus: (record: RelabelRecord, value: string) => void,
  isDeliveryStatusEditing: (record: RelabelRecord) => boolean,
  isStatusUpdating: (
    record: RelabelRecord,
    field: "delivery_status",
  ) => boolean,
  isDeleting: (record: RelabelRecord) => boolean,
  logisticsOptions: LogisticsProviderOption[],
): ProColumns<RelabelRecord>[] {
  const logisticsSelectOptions = logisticsOptions
    .map((item) => item.provider_name?.trim())
    .filter((item): item is string => Boolean(item))
    .map((providerName) => ({
      label: providerName,
      value: providerName,
    }));

  return [
    {
      title: "原货件号",
      dataIndex: "original_shipment_no",
      hideInTable: true,
      renderFormItem: renderShipmentNoSearchInput,
    },
    {
      title: "送仓货件号",
      dataIndex: "delivery_shipment_no",
      hideInTable: true,
      renderFormItem: renderShipmentNoSearchInput,
    },
    {
      title: "原货件号/送仓货件号",
      dataIndex: "original_shipment_no",
      width: 190,
      fixed: "left",
      search: false,
      render: (_, record) => {
        const originalShipmentNo = record.original_shipment_no?.trim();
        const deliveryShipmentNo = record.delivery_shipment_no?.trim();

        return (
          <div className="flex min-w-[160px] flex-col gap-1 whitespace-nowrap">
            {originalShipmentNo ? (
              <Typography.Link
                copyable={{ text: originalShipmentNo }}
                onClick={() => openShipmentPage(originalShipmentNo)}
              >
                {originalShipmentNo}
              </Typography.Link>
            ) : (
              <Typography.Text type="secondary">-</Typography.Text>
            )}
            <Typography.Text
              copyable={
                deliveryShipmentNo ? { text: deliveryShipmentNo } : false
              }
              type={deliveryShipmentNo ? undefined : "secondary"}
            >
              {deliveryShipmentNo || "-"}
            </Typography.Text>
          </div>
        );
      },
    },
    {
      title: "原店铺/送仓店铺",
      dataIndex: "original_store",
      width: 180,
      ellipsis: true,
      search: false,
      render: (_, record) => {
        const originalStore = record.original_store?.trim();
        const deliveryStore = record.delivery_store?.trim();

        return (
          <Typography.Text className="whitespace-nowrap">
            {originalStore || "-"}/{deliveryStore || "-"}
          </Typography.Text>
        );
      },
    },
    {
      title: "产品名称",
      dataIndex: "product_name",
      width: 120,
      ellipsis: true,
      search: false,
      render: (_, record) => record.product_name ?? "",
    },
    {
      title: "外箱数",
      dataIndex: "box_count",
      width: 86,
      search: false,
      render: (_, record) => record.box_count ?? "",
    },
    {
      title: "产品数",
      dataIndex: "product_count",
      width: 86,
      search: false,
      render: (_, record) => record.product_count ?? "",
    },
    {
      title: "换标费用",
      dataIndex: "relabel_fee",
      width: 92,
      search: false,
      render: (_, record) => record.relabel_fee ?? "",
    },
    {
      title: "送仓时间",
      dataIndex: "delivery_time",
      width: 100,
      search: false,
      render: (_, record) => formatRelabelDate(record.delivery_time),
    },
    {
      title: "是否送仓",
      dataIndex: "delivery_status",
      width: 96,
      search: false,
      onCell: (record) => ({
        className:
          record.delivery_status !== "是" && canEditRelabelDeliveryStatus(record)
            ? "relabel-delivery-overdue-cell"
            : undefined,
        onDoubleClick: () => {
          if (
            record.delivery_status !== "是" &&
            !isStatusUpdating(record, "delivery_status")
          ) {
            onStartDeliveryStatusEdit(record);
          }
        },
      }),
      render: (_, record) => {
        if (isDeliveryStatusEditing(record)) {
          return (
            <Select
              autoFocus
              size="small"
              value={record.delivery_status ?? "否"}
              className="w-[88px]"
              loading={isStatusUpdating(record, "delivery_status")}
              disabled={isStatusUpdating(record, "delivery_status")}
              options={[
                { label: "否", value: "否" },
                { label: "是", value: "是" },
              ]}
              onChange={(value) => onChangeDeliveryStatus(record, value)}
              onBlur={onCancelDeliveryStatusEdit}
            />
          );
        }

        return (
          <span
            className={
              record.delivery_status === "是"
                ? "inline-flex"
                : "inline-flex cursor-pointer"
            }
          >
            <Typography.Text>{record.delivery_status ?? "否"}</Typography.Text>
          </span>
        );
      },
      valueEnum: {
        是: { text: "是" },
        否: { text: "否" },
      },
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
        options: logisticsSelectOptions,
      },
    },
    {
      title: "换标类型",
      dataIndex: "relabel_type",
      width: 110,
      search: false,
      render: (_, record) => <RelabelTypeTag value={record.relabel_type} />,
      valueEnum: Object.fromEntries(
        relabelTypeOptions.map((item) => [item, { text: item }]),
      ),
    },
    {
      title: "备注",
      dataIndex: "remark",
      width: 140,
      ellipsis: true,
      search: false,
      render: (_, record) => record.remark ?? "",
    },
    {
      title: "操作",
      valueType: "option",
      width: 84,
      fixed: "right",
      search: false,
      render: (_, record) => {
        const hasDeliveryTime = Boolean(record.delivery_time?.trim());
        const actions = [
          <Tooltip key="edit" title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEdit(record)}
            />
          </Tooltip>,
        ];

        if (!hasDeliveryTime) {
          actions.push(
            <Tooltip
              key="delete"
              title="删除"
            >
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={isDeleting(record)}
                onClick={() => onDelete(record)}
              />
            </Tooltip>,
          );
        }

        return actions;
      },
    },
  ];
}
