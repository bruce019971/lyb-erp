import {
  CalculatorOutlined,
  CloudDownloadOutlined,
  DollarOutlined,
  EditOutlined,
  FileSearchOutlined,
  InfoCircleOutlined,
  PlusCircleOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Button, Select, Tag, Tooltip, Typography } from "antd";

import type { FreightRecord } from "../_lib/freights";
import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import type { ShipmentOption } from "../../shipments/_lib/shipments";

const TOKEN_SEPARATORS = [" ", "\n", "\r", "\t", ",", "，"];

function formatFreightDate(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

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
  onFetchVolume: (record: FreightRecord) => void,
  onFetchBill: (record: FreightRecord) => void,
  onFetchUnitPrice: (record: FreightRecord) => void,
  onFetchExtraFee: (record: FreightRecord) => void,
  onConfirmSaleasyTotalFee: (record: FreightRecord) => void,
  onCalculateFreight: (record: FreightRecord) => void,
  onStartPaidStatusEdit: (record: FreightRecord) => void,
  onCancelPaidStatusEdit: () => void,
  onChangePaidStatus: (record: FreightRecord, value: string) => void,
  isFetchingVolume: (record: FreightRecord) => boolean,
  isFetchingBill: (record: FreightRecord) => boolean,
  isFetchingUnitPrice: (record: FreightRecord) => boolean,
  isFetchingExtraFee: (record: FreightRecord) => boolean,
  isConfirmingSaleasyTotalFee: (record: FreightRecord) => boolean,
  isCalculatingFreight: (record: FreightRecord) => boolean,
  isPaidStatusEditing: (record: FreightRecord) => boolean,
  isPaidStatusUpdating: (record: FreightRecord) => boolean,
  shipmentOptions: ShipmentOption[],
  logisticsOptions: LogisticsProviderOption[],
): ProColumns<FreightRecord>[] {
  function canFetchVolume(record: FreightRecord) {
    const providerName = record.logistics_provider?.trim();
    return (
      providerName === "日升辉" ||
      providerName === "通途" ||
      providerName === "赛易"
    );
  }

  function hasBillAmount(record: FreightRecord) {
    return (
      typeof record.bill_amount === "number" &&
      Number.isFinite(record.bill_amount)
    );
  }

  function canEditPaidStatus(record: FreightRecord) {
    return hasBillAmount(record) || record.logistics_provider?.trim() === "唐朝";
  }

  function canFetchUnitPrice(record: FreightRecord) {
    return record.logistics_provider?.trim() === "日升辉";
  }

  function canFetchExtraFee(record: FreightRecord) {
    return record.logistics_provider?.trim() === "赛易";
  }

  function canConfirmSaleasyTotalFee(record: FreightRecord) {
    return (
      record.logistics_provider?.trim() === "赛易" &&
      record.saleasy_plan_status === 80
    );
  }

  function hasNonZeroAmount(value?: number | null) {
    return typeof value === "number" && Number.isFinite(value) && value !== 0;
  }

  function hasBillAmountMismatch(record: FreightRecord) {
    if (
      typeof record.bill_amount !== "number" ||
      !Number.isFinite(record.bill_amount) ||
      typeof record.total_fee !== "number" ||
      !Number.isFinite(record.total_fee)
    ) {
      return false;
    }

    return (
      Math.round(record.bill_amount * 100) !==
      Math.round(record.total_fee * 100)
    );
  }

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
  const orderStoreSelectOptions = Array.from(
    new Set(
      shipmentOptions
        .map((item) => item.order_store?.trim())
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
        maxTagCount: "responsive",
        maxTagTextLength: 18,
        placeholder: "可粘贴多个货件号",
        options: shipmentSelectOptions,
      },
    },
    {
      title: "下单店铺",
      dataIndex: "order_store",
      valueType: "select",
      hideInTable: true,
      fieldProps: {
        mode: "tags",
        showSearch: true,
        optionFilterProp: "label",
        tokenSeparators: TOKEN_SEPARATORS,
        maxTagCount: "responsive",
        maxTagTextLength: 18,
        placeholder: "可粘贴多个下单店铺",
        options: orderStoreSelectOptions,
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
        maxTagCount: "responsive",
        maxTagTextLength: 18,
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
        maxTagCount: "responsive",
        maxTagTextLength: 18,
        placeholder: "可粘贴多个产品名称",
        options: productSelectOptions,
      },
    },
    {
      title: "下单店铺",
      dataIndex: "order_store",
      width: 160,
      fixed: "left",
      ellipsis: true,
      search: false,
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
      title: "起始日期",
      dataIndex: "created_at",
      valueType: "dateRange",
      hideInTable: true,
    },
    {
      title: "账单已出",
      dataIndex: "bill_issued",
      valueType: "select",
      hideInTable: true,
      fieldProps: {
        placeholder: "请选择账单状态",
        options: [
          { label: "是", value: "是" },
          { label: "否", value: "否" },
        ],
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
      render: (dom, record) => {
        const remark = record.extra_fee_remark?.trim();

        if (!hasNonZeroAmount(record.extra_fee)) return dom;

        return (
          <span className="inline-flex items-center gap-1">
            {dom}
            <Tooltip title={remark || "暂无备注"}>
              <InfoCircleOutlined className="cursor-help text-[#1677ff]" />
            </Tooltip>
          </span>
        );
      },
    },
    {
      title: "总费用",
      dataIndex: "total_fee",
      valueType: "money",
      width: 140,
      search: false,
    },
    {
      title: "账单金额",
      dataIndex: "bill_amount",
      valueType: "money",
      width: 140,
      search: false,
      render: (dom, record) =>
        hasBillAmountMismatch(record) ? (
          <span className="freight-bill-amount-mismatch">{dom}</span>
        ) : (
          dom
        ),
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
      onCell: (record) => ({
        onDoubleClick: () => {
          if (
            canEditPaidStatus(record) &&
            record.freight_paid_status !== "是" &&
            !isPaidStatusUpdating(record)
          ) {
            onStartPaidStatusEdit(record);
          }
        },
      }),
      render: (_, record) => {
        if (isPaidStatusEditing(record)) {
          return (
            <Select
              autoFocus
              size="small"
              value={record.freight_paid_status ?? "否"}
              className="w-[88px]"
              loading={isPaidStatusUpdating(record)}
              disabled={isPaidStatusUpdating(record)}
              options={[
                { label: "否", value: "否" },
                { label: "是", value: "是" },
              ]}
              onChange={(value) => onChangePaidStatus(record, value)}
              onBlur={onCancelPaidStatusEdit}
            />
          );
        }

        return (
          <span
            className={
              canEditPaidStatus(record) && record.freight_paid_status !== "是"
                ? "inline-flex cursor-pointer"
                : "inline-flex"
            }
          >
            <PaymentTag value={record.freight_paid_status} />
          </span>
        );
      },
      valueEnum: {
        是: { text: "是" },
        否: { text: "否" },
      },
    },
    {
      title: "到仓时间",
      dataIndex: "overseas_warehouse_arrived_at",
      width: 100,
      search: false,
      render: (_, record) =>
        formatFreightDate(record.overseas_warehouse_arrived_at),
    },
    {
      title: "操作",
      valueType: "option",
      width: 260,
      fixed: "right",
      search: false,
      render: (_, record) => {
        const locked = hasBillAmount(record);

        return [
          typeof record.total_fee === "number" &&
          Number.isFinite(record.total_fee) ? (
            <Tooltip key="fetch-bill" title="获取账单">
              <Button
                type="text"
                size="small"
                icon={<FileSearchOutlined />}
                loading={isFetchingBill(record)}
                onClick={() => onFetchBill(record)}
              />
            </Tooltip>
          ) : null,
          locked || !canFetchUnitPrice(record) ? null : (
            <Tooltip key="fetch-unit-price" title="获取单价">
              <Button
                type="text"
                size="small"
                icon={<DollarOutlined />}
                loading={isFetchingUnitPrice(record)}
                onClick={() => onFetchUnitPrice(record)}
              />
            </Tooltip>
          ),
          locked || !canFetchExtraFee(record) ? null : (
            <Tooltip key="fetch-extra-fee" title="获取额外费用">
              <Button
                type="text"
                size="small"
                icon={<PlusCircleOutlined />}
                loading={isFetchingExtraFee(record)}
                onClick={() => onFetchExtraFee(record)}
              />
            </Tooltip>
          ),
          canConfirmSaleasyTotalFee(record) ? (
            <Tooltip key="confirm-saleasy-total-fee" title="确认总费用">
              <Button
                type="text"
                size="small"
                icon={<SafetyCertificateOutlined />}
                loading={isConfirmingSaleasyTotalFee(record)}
                onClick={() => onConfirmSaleasyTotalFee(record)}
              />
            </Tooltip>
          ) : null,
          locked ? null : (
            <Tooltip
              key="fetch-volume"
              title={
                canFetchVolume(record)
                  ? "获取方数"
                  : "仅日升辉/通途/赛易货件可获取方数"
              }
            >
              <Button
                type="text"
                size="small"
                icon={<CloudDownloadOutlined />}
                loading={isFetchingVolume(record)}
                disabled={!canFetchVolume(record)}
                onClick={() => onFetchVolume(record)}
              />
            </Tooltip>
          ),
          locked ? null : (
            <Tooltip key="calculate" title="计算运费">
              <Button
                type="text"
                size="small"
                icon={<CalculatorOutlined />}
                loading={isCalculatingFreight(record)}
                onClick={() => onCalculateFreight(record)}
              />
            </Tooltip>
          ),
          locked ? null : (
            <Tooltip key="edit" title="编辑">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => onEdit(record)}
              />
            </Tooltip>
          ),
        ];
      },
    },
  ];
}
