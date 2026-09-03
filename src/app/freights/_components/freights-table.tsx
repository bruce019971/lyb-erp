"use client";

import { CheckCircleOutlined } from "@ant-design/icons";
import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Button, Table, Tooltip } from "antd";
import type { Key, MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import type { ShipmentOption } from "../../shipments/_lib/shipments";
import type { FreightRecord, FreightSummary } from "../_lib/freights";
import { requestFreightRecords } from "../_lib/freights-request";
import { getFreightColumns } from "./freights-columns";

type FreightsTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  shipmentOptions: ShipmentOption[];
  logisticsOptions: LogisticsProviderOption[];
  onBatchConfirm: (records: FreightRecord[]) => void;
  onEdit: (record: FreightRecord) => void;
  onFetchVolume: (record: FreightRecord) => void;
  onFetchBill: (record: FreightRecord) => void;
  onFetchUnitPrice: (record: FreightRecord) => void;
  onFetchExtraFee: (record: FreightRecord) => void;
  onConfirmSaleasyTotalFee: (record: FreightRecord) => void;
  onCalculateFreight: (record: FreightRecord) => void;
  onStartPaidStatusEdit: (record: FreightRecord) => void;
  onCancelPaidStatusEdit: () => void;
  onChangePaidStatus: (record: FreightRecord, value: string) => void;
  isFetchingVolume: (record: FreightRecord) => boolean;
  isFetchingBill: (record: FreightRecord) => boolean;
  isFetchingUnitPrice: (record: FreightRecord) => boolean;
  isFetchingExtraFee: (record: FreightRecord) => boolean;
  isConfirmingSaleasyTotalFee: (record: FreightRecord) => boolean;
  isCalculatingFreight: (record: FreightRecord) => boolean;
  isPaidStatusEditing: (record: FreightRecord) => boolean;
  isPaidStatusUpdating: (record: FreightRecord) => boolean;
  isBatchConfirming: boolean;
};

const FREIGHT_SUMMARY_COLUMN_KEYS = [
  "shipment_no",
  "product_name",
  "order_store",
  "created_at",
  "freight_unit_price",
  "volume",
  "extra_fee",
  "total_fee",
  "bill_amount",
  "unit_fee",
  "box_count",
  "freight_paid_status",
  "overseas_warehouse_arrived_at",
] as const;

function hasBillAmount(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value);
}

function formatSummaryMoney(value?: number | null) {
  const amount =
    typeof value === "number" && Number.isFinite(value) ? value : 0;

  return `¥${amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSummaryVolume(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(3)
    : "0.000";
}

export default function FreightsTable({
  actionRef,
  shipmentOptions,
  logisticsOptions,
  onBatchConfirm,
  onEdit,
  onFetchVolume,
  onFetchBill,
  onFetchUnitPrice,
  onFetchExtraFee,
  onConfirmSaleasyTotalFee,
  onCalculateFreight,
  onStartPaidStatusEdit,
  onCancelPaidStatusEdit,
  onChangePaidStatus,
  isFetchingVolume,
  isFetchingBill,
  isFetchingUnitPrice,
  isFetchingExtraFee,
  isConfirmingSaleasyTotalFee,
  isCalculatingFreight,
  isPaidStatusEditing,
  isPaidStatusUpdating,
  isBatchConfirming,
}: FreightsTableProps) {
  const columns = useMemo(
    () =>
      getFreightColumns(
        onEdit,
        onFetchVolume,
        onFetchBill,
        onFetchUnitPrice,
        onFetchExtraFee,
        onConfirmSaleasyTotalFee,
        onCalculateFreight,
        onStartPaidStatusEdit,
        onCancelPaidStatusEdit,
        onChangePaidStatus,
        isFetchingVolume,
        isFetchingBill,
        isFetchingUnitPrice,
        isFetchingExtraFee,
        isConfirmingSaleasyTotalFee,
        isCalculatingFreight,
        isPaidStatusEditing,
        isPaidStatusUpdating,
        shipmentOptions,
        logisticsOptions,
      ),
    [
      isCalculatingFreight,
      isFetchingVolume,
      isFetchingBill,
      isFetchingExtraFee,
      isFetchingUnitPrice,
      isConfirmingSaleasyTotalFee,
      logisticsOptions,
      onCalculateFreight,
      onCancelPaidStatusEdit,
      onChangePaidStatus,
      onEdit,
      onFetchBill,
      onFetchExtraFee,
      onConfirmSaleasyTotalFee,
      onFetchUnitPrice,
      onFetchVolume,
      onStartPaidStatusEdit,
      isPaidStatusEditing,
      isPaidStatusUpdating,
      shipmentOptions,
    ],
  );
  const searchParamsRef = useRef<Record<string, unknown>>({});
  const [dataSource, setDataSource] = useState<FreightRecord[]>([]);
  const [summary, setSummary] = useState<FreightSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const selectedRecords = useMemo(() => {
    const selectedIds = new Set(selectedRowKeys.map((key) => String(key)));
    return dataSource.filter((record) => selectedIds.has(record.id));
  }, [dataSource, selectedRowKeys]);

  const loadRecords = useCallback(
    async (params: Record<string, unknown>) => {
      setLoading(true);

      try {
        const result = await requestFreightRecords(params);

        const nextData = result.data ?? [];
        setDataSource(nextData);
        setSummary(result.summary ?? null);
        setSelectedRowKeys([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const reloadFirstPage = useCallback(async () => {
    await loadRecords(searchParamsRef.current);
  }, [loadRecords]);

  useEffect(() => {
    void reloadFirstPage();
  }, [reloadFirstPage]);

  useEffect(() => {
    if (!actionRef) return;

    actionRef.current = {
      reload: () => {
        void reloadFirstPage();
      },
      reloadAndRest: () => {
        searchParamsRef.current = {};
        void loadRecords({});
      },
    } as ActionType;

    return () => {
      actionRef.current = undefined;
    };
  }, [actionRef, loadRecords, reloadFirstPage]);

  return (
    <ProTable<FreightRecord>
      className="freights-table-with-sticky-summary"
      rowKey="id"
      size="small"
      columns={columns}
      dataSource={dataSource}
      loading={loading}
      rowSelection={{
        type: "checkbox",
        selectedRowKeys,
        onChange: setSelectedRowKeys,
        getCheckboxProps: (record) => {
          const billed = hasBillAmount(record.bill_amount);
          const confirmed = record.freight_paid_status === "是";

          return {
            disabled: !billed || confirmed,
            title: !billed
              ? "账单未出，不能选择"
              : confirmed
                ? "运费已确认"
                : "选择该运费记录",
          };
        },
      }}
      rowClassName={(record) => {
        if (
          record.logistics_provider?.trim() === "赛易" &&
          record.saleasy_plan_status === 80
        ) {
          return "freight-saleasy-plan-status-80-row";
        }
        if (record.freight_paid_status === "是") return "freight-paid-row";
        if (hasBillAmount(record.bill_amount)) return "freight-unpaid-billed-row";
        return "";
      }}
      search={{
        labelWidth: "auto",
        defaultCollapsed: false,
      }}
      options={{
        density: false,
        fullScreen: false,
        reload: false,
        setting: true,
      }}
      tableAlertRender={false}
      tableAlertOptionRender={false}
      toolBarRender={() => [
        <Tooltip
          key="batch-confirm"
          title={
            selectedRecords.length > 0
              ? `确认选中的 ${selectedRecords.length} 条运费记录`
              : "请先选择已出账单且未确认的运费记录"
          }
        >
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            disabled={selectedRecords.length === 0}
            loading={isBatchConfirming}
            onClick={() => onBatchConfirm(selectedRecords)}
          >
            批量确认运费
          </Button>
        </Tooltip>,
      ]}
      scroll={{ x: 2000, y: "calc(100vh - 360px)" }}
      onSubmit={(values) => {
        searchParamsRef.current = values;
        void loadRecords(values);
      }}
      onReset={() => {
        searchParamsRef.current = {};
        void loadRecords({});
      }}
      pagination={false}
      dateFormatter="string"
      summary={() => (
        <Table.Summary fixed="bottom">
          <Table.Summary.Row className="freight-summary-row">
            <Table.Summary.Cell index={0} />
            {FREIGHT_SUMMARY_COLUMN_KEYS.map((key, index) => {
              let content = null;

              if (key === "shipment_no") {
                content = "合计";
              }

              if (key === "volume") {
                content = formatSummaryVolume(summary?.volume);
              }

              if (key === "total_fee") {
                content = formatSummaryMoney(summary?.total_fee);
              }

              if (key === "bill_amount") {
                content = formatSummaryMoney(summary?.bill_amount);
              }

              return (
                <Table.Summary.Cell key={key} index={index + 1}>
                  {content}
                </Table.Summary.Cell>
              );
            })}
            <Table.Summary.Cell index={FREIGHT_SUMMARY_COLUMN_KEYS.length + 1} />
          </Table.Summary.Row>
        </Table.Summary>
      )}
    />
  );
}
