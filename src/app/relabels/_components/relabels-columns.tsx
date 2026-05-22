import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Button, Input, Select, Tag, Tooltip, Typography } from "antd";

import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import {
  canEditRelabelDeliveryStatus,
  formatRelabelDate,
  relabelTypeOptions,
  type RelabelRecord,
} from "../_lib/relabels";

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

function openStorePage(storeName?: string | null) {
  const trimmedStoreName = storeName?.trim();
  if (!trimmedStoreName) return;

  const params = new URLSearchParams();
  params.set("seller_name", trimmedStoreName);
  window.history.pushState(null, "", `/stores?${params.toString()}`);
}

function renderShipmentNoSearchInput() {
  return (
    <Input.TextArea
      autoSize={{ minRows: 1, maxRows: 3 }}
      placeholder="可用回车、空格或逗号分隔"
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
      title: "送仓货件号",
      dataIndex: "delivery_shipment_no",
      width: 130,
      fixed: "left",
      renderFormItem: renderShipmentNoSearchInput,
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
      title: "原货件号",
      dataIndex: "original_shipment_no",
      width: 130,
      renderFormItem: renderShipmentNoSearchInput,
      render: (_, record) => {
        const shipmentNo = record.original_shipment_no?.trim();
        const copyable = shipmentNo ? { text: shipmentNo } : false;

        return shipmentNo ? (
          <Typography.Link
            className="whitespace-nowrap"
            copyable={copyable}
            onClick={() => openShipmentPage(shipmentNo)}
          >
            {shipmentNo}
          </Typography.Link>
        ) : (
          <Typography.Text className="whitespace-nowrap" copyable={copyable}>
            {record.original_shipment_no ?? ""}
          </Typography.Text>
        );
      },
    },
    {
      title: "箱数",
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
      render: () => "",
    },
    {
      title: "送仓时间",
      dataIndex: "delivery_time",
      width: 100,
      search: false,
      render: (_, record) => formatRelabelDate(record.delivery_time) || "-",
    },
    {
      title: "是否送仓",
      dataIndex: "delivery_status",
      width: 96,
      search: false,
      onCell: (record) => ({
        className:
          record.delivery_status === "是"
            ? "relabel-delivery-done-cell"
              : undefined,
        onDoubleClick: () => {
          if (
            canEditRelabelDeliveryStatus(record) &&
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
              canEditRelabelDeliveryStatus(record)
                ? "inline-flex cursor-pointer"
                : "inline-flex"
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
      title: "送仓店铺",
      dataIndex: "delivery_store",
      width: 110,
      ellipsis: true,
      search: false,
      render: (_, record) => {
        const storeName = record.delivery_store?.trim();

        return storeName ? (
          <Typography.Link
            className="whitespace-nowrap"
            onClick={() => openStorePage(storeName)}
          >
            {storeName}
          </Typography.Link>
        ) : (
          <Typography.Text className="whitespace-nowrap">
            {record.delivery_store ?? ""}
          </Typography.Text>
        );
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
      title: "操作",
      valueType: "option",
      width: 84,
      fixed: "right",
      search: false,
      render: (_, record) => {
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

        if (!record.delivery_time?.trim()) {
          actions.push(
            <Tooltip key="delete" title="删除">
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
