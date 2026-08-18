import {
  DeleteOutlined,
  EditOutlined,
  FileSyncOutlined,
  ShoppingCartOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Button, Select, Tooltip, Typography } from "antd";

import {
  formatShipmentDate,
  isShipmentDeliveryOverdue,
  type ShipmentRecord,
} from "../_lib/shipments";
import type { ProductShipmentOption } from "../../products/_lib/products";
import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import type { StoreOption } from "../../stores/_lib/stores";

function renderShipmentSearchTagsInput() {
  return (
    <Select
      mode="tags"
      allowClear
      open={false}
      tokenSeparators={[" ", "\n", "\t", ",", "，"]}
      maxTagCount="responsive"
      maxTagTextLength={18}
      placeholder="可用回车、空格或逗号分隔"
      className="w-full"
    />
  );
}

function renderNowrapShipmentDate(value?: string | null) {
  return (
    <Typography.Text className="block min-w-max whitespace-nowrap">
      {formatShipmentDate(value)}
    </Typography.Text>
  );
}

function safeFilePart(value?: string | null) {
  return value?.trim().replace(/[\\/:*?"<>|]+/g, "_") ?? "";
}

function buildProductLabelFilename(record: ShipmentRecord) {
  const productName = safeFilePart(record.product_name) || "产品";
  const mlCode = safeFilePart(record.ml_code) || "MLCode";
  const storeCode = safeFilePart(record.store_code) || "StoreCode";

  return `${productName}产品标签_${mlCode}_${storeCode}`;
}

async function downloadProductLabel(record: ShipmentRecord) {
  const productLabelUrl = record.product_label_url?.trim();
  if (!productLabelUrl) return;

  const response = await fetch(productLabelUrl);
  if (!response.ok) return;

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  const suffix = productLabelUrl.split(".").pop()?.split("?")[0] ?? "";
  const filenameBase = buildProductLabelFilename(record);

  link.href = objectUrl;
  link.download = suffix ? `${filenameBase}.${suffix}` : filenameBase;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

export function getShipmentColumns(
  onEdit: (record: ShipmentRecord) => void,
  onDownloadCartonLabel: (record: ShipmentRecord) => void,
  onDownloadLogisticsBoxMark: (record: ShipmentRecord) => void,
  onGenerateCartonLabel: (record: ShipmentRecord) => void,
  onGenerateLogisticsBoxMark: (record: ShipmentRecord) => void,
  onLogisticsOrder: (record: ShipmentRecord) => void,
  onDelete: (record: ShipmentRecord) => void,
  onStartDeliveryStatusEdit: (record: ShipmentRecord) => void,
  onCancelDeliveryStatusEdit: () => void,
  onChangeDeliveryStatus: (record: ShipmentRecord, value: string) => void,
  onStartRelabelEdit: (record: ShipmentRecord) => void,
  onCancelRelabelEdit: () => void,
  onChangeRelabel: (record: ShipmentRecord, value: string) => void,
  isDeliveryStatusEditing: (record: ShipmentRecord) => boolean,
  isDeliveryStatusUpdating: (record: ShipmentRecord) => boolean,
  isRelabelEditing: (record: ShipmentRecord) => boolean,
  isRelabelUpdating: (record: ShipmentRecord) => boolean,
  isDeleting: (record: ShipmentRecord) => boolean,
  isGeneratingCartonLabel: (record: ShipmentRecord) => boolean,
  isGeneratingLogisticsBoxMark: (record: ShipmentRecord) => boolean,
  isSubmittingLogisticsOrder: (record: ShipmentRecord) => boolean,
  storeOptions: StoreOption[],
  productOptions: ProductShipmentOption[],
  logisticsOptions: LogisticsProviderOption[],
): ProColumns<ShipmentRecord>[] {
  function DeliveryStatusTag({
    value,
  }: {
    value?: string | null;
  }) {
    return <Typography.Text>{value || ""}</Typography.Text>;
  }

  const storeSelectOptions = Array.from(
    new Set(
      storeOptions
        .map((item) => item.seller_name?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  ).map((item) => ({
    label: item,
    value: item,
  }));
  const productSelectOptions = Array.from(
    new Set(
      productOptions
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
  const productStoreMap = new Map(
    productOptions
      .filter((item) => item.product_name?.trim())
      .map((item) => [item.product_name!.trim(), item.store_name]),
  );
  const productMetaMap = new Map(
    productOptions
      .filter((item) => item.product_name?.trim())
      .map((item) => {
        const productName = item.product_name!.trim();
        const storeName = item.store_name?.trim() ?? "";

        return [`${productName}\u0000${storeName}`, item];
      }),
  );
  const productMetaFallbackMap = new Map(
    productOptions
      .filter((item) => item.product_name?.trim())
      .map((item) => [item.product_name!.trim(), item]),
  );

  return [
    {
      title: "创建时间",
      dataIndex: "created_at",
      valueType: "dateRange",
      width: 88,
      hideInSearch: true,
      render: (_, record) => renderNowrapShipmentDate(record.created_at),
    },
    {
      title: "货件号",
      dataIndex: "shipment_no",
      hideInTable: true,
      renderFormItem: renderShipmentSearchTagsInput,
    },
    {
      title: "货件号/运单编号",
      dataIndex: "shipment_no",
      width: 170,
      fixed: "left",
      search: false,
      render: (_, record) => {
        const shipmentNo = record.shipment_no?.trim();
        const trackingNo = record.tracking_no?.trim();
        const cartonLabelUrl = record.carton_label_url?.trim();
        const logisticsBoxMarkUrl = record.logistics_box_mark_url?.trim();
        const shipmentNoNode = shipmentNo && cartonLabelUrl ? (
          <Typography.Link
            className="whitespace-nowrap"
            copyable={{ text: shipmentNo }}
            onClick={(event) => {
              event.stopPropagation();
              onDownloadCartonLabel(record);
            }}
          >
            {shipmentNo}
          </Typography.Link>
        ) : shipmentNo ? (
          <Typography.Text
            className="whitespace-nowrap"
            copyable={{ text: shipmentNo }}
          >
            {shipmentNo}
          </Typography.Text>
        ) : (
          <Typography.Text className="whitespace-nowrap">-</Typography.Text>
        );
        const trackingNoNode = trackingNo && logisticsBoxMarkUrl ? (
          <Typography.Link
            className="whitespace-nowrap"
            copyable={{ text: trackingNo }}
            onClick={(event) => {
              event.stopPropagation();
              onDownloadLogisticsBoxMark(record);
            }}
          >
            {trackingNo}
          </Typography.Link>
        ) : (
          <Typography.Text
            className="whitespace-nowrap"
            copyable={trackingNo ? { text: trackingNo } : false}
            type={trackingNo ? undefined : "secondary"}
          >
            {trackingNo || "-"}
          </Typography.Text>
        );

        return (
          <div className="flex min-w-[150px] flex-col gap-1 whitespace-nowrap">
            {shipmentNoNode}
            {trackingNoNode}
          </div>
        );
      },
    },
    {
      title: "产品名称/ML Code",
      dataIndex: "product_name",
      width: 150,
      fixed: "left",
      ellipsis: true,
      valueType: "select",
      formItemProps: {
        label: "产品名称",
      },
      fieldProps: {
        mode: "multiple",
        showSearch: true,
        optionFilterProp: "label",
        placeholder: "请选择产品名称",
        options: productSelectOptions,
      },
      render: (_, record) => {
        const productName = record.product_name?.trim();
        const storeName = record.order_store?.trim();
        const productMeta =
          productName && storeName
            ? productMetaMap.get(`${productName}\u0000${storeName}`)
            : undefined;
        const resolvedProductMeta =
          productMeta ||
          (!storeName && productName
            ? productMetaFallbackMap.get(productName)
            : undefined);
        const mlCode =
          record.ml_code?.trim() ||
          resolvedProductMeta?.ml_code?.trim();
        const productLabelUrl = resolvedProductMeta
          ? resolvedProductMeta.product_label_url?.trim()
          : record.product_label_url?.trim();

        const productNameNode = productName ? (
          <Typography.Text>{productName}</Typography.Text>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        );

        const mlCodeNode =
          mlCode && productLabelUrl ? (
            <Typography.Link
              className="whitespace-nowrap"
              copyable={{ text: mlCode }}
              onClick={(event) => {
                event.stopPropagation();
                void downloadProductLabel({
                  ...record,
                  ml_code: mlCode,
                  product_label_url: productLabelUrl,
                });
              }}
            >
              {mlCode}
            </Typography.Link>
          ) : (
            <Typography.Text
              className="whitespace-nowrap"
              copyable={mlCode ? { text: mlCode } : false}
              type={mlCode ? undefined : "secondary"}
            >
              {mlCode || "-"}
            </Typography.Text>
          );

        return (
          <div className="flex min-w-[130px] flex-col gap-1">
            <div className="truncate">{productNameNode}</div>
            {mlCodeNode}
          </div>
        );
      },
    },
    {
      title: "下单店铺",
      dataIndex: "order_store",
      width: 88,
      ellipsis: true,
      valueType: "select",
      fieldProps: {
        mode: "multiple",
        showSearch: true,
        optionFilterProp: "label",
        placeholder: "请选择下单店铺",
        options: storeSelectOptions,
      },
      render: (_, record) => {
        const productName = record.product_name?.trim();
        const storeName =
          record.order_store?.trim() ||
          (productName ? productStoreMap.get(productName)?.trim() : undefined);

        return storeName ? <Typography.Text>{storeName}</Typography.Text> : "-";
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
      title: "起始日期",
      dataIndex: "created_at",
      valueType: "dateRange",
      hideInTable: true,
    },
    {
      title: "运单编号",
      dataIndex: "tracking_no",
      hideInTable: true,
      renderFormItem: renderShipmentSearchTagsInput,
    },
    {
      title: "箱数",
      dataIndex: "box_count",
      valueType: "digit",
      width: 62,
      search: false,
    },
    {
      title: "装箱数",
      dataIndex: "pcs_per_box",
      valueType: "digit",
      width: 72,
      search: false,
    },
    {
      title: "产品数量",
      dataIndex: "total_qty",
      valueType: "digit",
      width: 72,
      search: false,
    },
    {
      title: "是否到仓",
      dataIndex: "warehouse_arrived_status",
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
      title: "到仓时间",
      dataIndex: "overseas_warehouse_arrived_at",
      valueType: "dateRange",
      width: 88,
      hideInSearch: true,
      render: (_, record) =>
        renderNowrapShipmentDate(record.overseas_warehouse_arrived_at),
    },
    {
      title: "送仓时间",
      dataIndex: "appointment_time",
      valueType: "dateRange",
      width: 88,
      hideInSearch: true,
      render: (_, record) => {
        if (record.is_relabel === "是") {
          const deliveryTimes = record.relabel_delivery_times ?? [];

          if (deliveryTimes.length === 0) {
            return renderNowrapShipmentDate(record.appointment_time);
          }

          return (
            <div className="flex flex-col gap-1">
              {deliveryTimes.map((value) => (
                <Typography.Text
                  key={value}
                  className="block min-w-max whitespace-nowrap"
                >
                  {formatShipmentDate(value)}
                </Typography.Text>
              ))}
            </div>
          );
        }

        return renderNowrapShipmentDate(record.appointment_time);
      },
    },
    {
      title: "是否换标",
      dataIndex: "is_relabel",
      width: 78,
      onCell: (record) => ({
        onDoubleClick: () => {
          if (!isRelabelUpdating(record)) {
            onStartRelabelEdit(record);
          }
        },
      }),
      render: (_, record) => {
        if (isRelabelEditing(record)) {
          return (
            <Select
              autoFocus
              size="small"
              value={record.is_relabel ?? ""}
              className="w-[70px]"
              loading={isRelabelUpdating(record)}
              disabled={isRelabelUpdating(record)}
              options={[
                { label: "空", value: "" },
                { label: "否", value: "否" },
                { label: "是", value: "是" },
              ]}
              onChange={(value) => onChangeRelabel(record, value)}
              onBlur={onCancelRelabelEdit}
            />
          );
        }

        return (
          <span
            className={
              record.is_relabel === "是"
                ? "inline-flex"
                : "inline-flex cursor-pointer"
            }
          >
            <Typography.Text>{record.is_relabel ?? ""}</Typography.Text>
          </span>
        );
      },
      valueEnum: {
        是: { text: "是" },
        否: { text: "否" },
      },
    },
    {
      title: "是否送仓",
      dataIndex: "delivery_status",
      width: 78,
      onCell: (record) => ({
        className:
          record.delivery_status !== "是" && isShipmentDeliveryOverdue(record)
              ? "shipment-delivery-overdue-cell"
              : undefined,
        onDoubleClick: () => {
          if (!isDeliveryStatusUpdating(record)) {
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
              className="w-[70px]"
              loading={isDeliveryStatusUpdating(record)}
              disabled={isDeliveryStatusUpdating(record)}
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
              isDeliveryStatusUpdating(record)
                ? "inline-flex"
                : "inline-flex cursor-pointer"
            }
          >
            <DeliveryStatusTag
              value={record.delivery_status ?? "否"}
            />
          </span>
        );
      },
      valueEnum: {
        是: { text: "是" },
        否: { text: "否" },
      },
    },
    {
      title: "货物价值",
      dataIndex: "goods_value",
      valueType: "money",
      width: 86,
      search: false,
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
      title: "更新时间",
      dataIndex: "updated_at",
      valueType: "dateRange",
      width: 88,
      hideInSearch: true,
      render: (_, record) => renderNowrapShipmentDate(record.updated_at),
    },
    {
      title: "操作",
      valueType: "option",
      width: 150,
      fixed: "right",
      search: false,
      render: (_, record) => {
        const hasCartonLabelUrl = Boolean(record.carton_label_url?.trim());
        const hasTrackingNo = Boolean(record.tracking_no?.trim());
        const hasLogisticsBoxMarkUrl = Boolean(
          record.logistics_box_mark_url?.trim(),
        );
        const logisticsProviderName = record.logistics_provider?.trim();
        const canGenerateLogisticsBoxMark =
          logisticsProviderName === "日升辉" ||
          logisticsProviderName === "通途" ||
          logisticsProviderName === "赛易";
        const canOpenLogisticsOrder =
          logisticsProviderName === "日升辉" ||
          logisticsProviderName === "通途" ||
          logisticsProviderName === "赛易";

        return [
          !hasCartonLabelUrl ? (
            <Tooltip key="generate-carton-label" title="生成外箱标签">
              <Button
                type="text"
                size="small"
                icon={<FileSyncOutlined />}
                loading={isGeneratingCartonLabel(record)}
                onClick={() => onGenerateCartonLabel(record)}
              />
            </Tooltip>
          ) : null,
          canOpenLogisticsOrder && !hasTrackingNo ? (
            <Tooltip key="logistics-order" title="物流下单">
              <Button
                type="text"
                size="small"
                icon={<ShoppingCartOutlined />}
                loading={isSubmittingLogisticsOrder(record)}
                onClick={() => onLogisticsOrder(record)}
              />
            </Tooltip>
          ) : null,
          canGenerateLogisticsBoxMark && hasTrackingNo && !hasLogisticsBoxMarkUrl ? (
            <Tooltip key="generate-logistics-box-mark" title="生成物流箱唛">
              <Button
                type="text"
                size="small"
                icon={<QrcodeOutlined />}
                loading={isGeneratingLogisticsBoxMark(record)}
                onClick={() => onGenerateLogisticsBoxMark(record)}
              />
            </Tooltip>
          ) : null,
          <Tooltip key="edit" title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEdit(record)}
            />
          </Tooltip>,
          !hasTrackingNo ? (
            <Tooltip key="delete" title="删除">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={isDeleting(record)}
                onClick={() => onDelete(record)}
              />
            </Tooltip>
          ) : null,
        ];
      },
    },
  ];
}
