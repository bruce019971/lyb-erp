"use client";

import { CheckCircleOutlined, FileSearchOutlined } from "@ant-design/icons";
import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Button, Table, Tooltip } from "antd";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import type { FreightRecord, FreightSummary } from "../_lib/freights";
import { requestFreightRecords, requestFreightSummary } from "../_lib/freights-request";
import { getBatchBillSkipReason } from "../_lib/freight-bills";
import { getFreightColumns } from "./freights-columns";
import { useServerTable } from "@/hooks/use-server-table";

const buildParams = (params: Record<string, unknown>) => params;

type FreightsTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  logisticsOptions: LogisticsProviderOption[];
  onBatchConfirm: (records: FreightRecord[]) => void;
  onBatchGenerateBills: (records: FreightRecord[]) => void;
  isBatchGeneratingBills: boolean;
  billProgress: { completed: number; total: number };
  isRowUpdating: boolean;
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
  logisticsOptions,
  onBatchConfirm,
  onBatchGenerateBills,
  isBatchGeneratingBills,
  billProgress,
  isRowUpdating,
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
    ],
  );
  const searchParamsRef = useRef<Record<string, unknown>>({});
  const {
    dataSource, loading, summary, summaryLoading, selectedRecords,
    selectedRowKeys, onSelectionChange, loadRecords, reload, pagination, onTableChange,
  } = useServerTable<FreightRecord, FreightSummary>({
    request: requestFreightRecords, requestSummary: requestFreightSummary, buildParams,
  });
  const selectedConfirmableRecords = selectedRecords.filter((record) =>
    hasBillAmount(record.bill_amount) && record.freight_paid_status !== "是",
  );
  const selectedBillRecords = selectedRecords.filter((record) => getBatchBillSkipReason(record) === null);
  const batchBusy = isBatchGeneratingBills || isBatchConfirming;

  const reloadFirstPage = useCallback(async () => {
    await loadRecords(searchParamsRef.current);
  }, [loadRecords]);

  useEffect(() => {
    void reloadFirstPage();
  }, [reloadFirstPage]);

  useEffect(() => {
    if (!actionRef) return;

    actionRef.current = {
      reload,
      reloadAndRest: () => {
        searchParamsRef.current = {};
        return loadRecords({});
      },
    } as ActionType;

    return () => {
      actionRef.current = undefined;
    };
  }, [actionRef, loadRecords, reload]);

  return (
    <ProTable<FreightRecord>
      className="freights-table-with-sticky-summary"
      rowKey="id"
      size="small"
      columns={columns}
      dataSource={dataSource}
      loading={loading || batchBusy}
      rowSelection={{
        type: "checkbox",
        selectedRowKeys,
        preserveSelectedRowKeys: true,
        onChange: onSelectionChange,
        getCheckboxProps: (record) => {
          const billed = hasBillAmount(record.bill_amount);
          const confirmed = record.freight_paid_status === "是";

          return {
            disabled: loading || batchBusy || isRowUpdating || confirmed || (!billed && getBatchBillSkipReason(record) !== null),
            title: confirmed ? "运费已确认"
              : billed ? "选择该记录以确认运费"
                : getBatchBillSkipReason(record) ?? "选择该记录以生成账单",
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
        reload: () => { void reload(); },
        setting: true,
      }}
      tableAlertRender={false}
      tableAlertOptionRender={false}
      toolBarRender={() => [
        <Tooltip key="batch-bills" title={`为选中的 ${selectedBillRecords.length} 条未出账单记录生成账单，已出账单的记录自动跳过`}>
          <Button
            icon={<FileSearchOutlined />}
            disabled={!selectedBillRecords.length || loading || batchBusy || isRowUpdating}
            loading={isBatchGeneratingBills}
            onClick={() => onBatchGenerateBills(selectedRecords)}
          >
            {isBatchGeneratingBills
              ? `生成账单中 ${billProgress.completed}/${billProgress.total}`
              : "批量生成账单"}
          </Button>
        </Tooltip>,
        <Tooltip
          key="batch-confirm"
          title={
            selectedConfirmableRecords.length > 0
              ? `确认选中的 ${selectedConfirmableRecords.length} 条已出账单运费记录`
              : "请先选择已出账单且未确认的运费记录"
          }
        >
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            disabled={selectedConfirmableRecords.length === 0 || loading || batchBusy || isRowUpdating}
            loading={isBatchConfirming}
            onClick={() => onBatchConfirm(selectedConfirmableRecords)}
          >
            批量确认运费
          </Button>
        </Tooltip>,
      ]}
      scroll={{ x: 2000, y: "calc(100vh - 408px)" }}
      onSubmit={(values) => {
        searchParamsRef.current = values;
        void loadRecords(values);
      }}
      onReset={() => {
        searchParamsRef.current = {};
        void loadRecords({});
      }}
      pagination={{ ...pagination, disabled: batchBusy }}
      onChange={onTableChange}
      form={{ disabled: batchBusy }}
      dateFormatter="string"
      summary={() => (
        <Table.Summary fixed="bottom">
          <Table.Summary.Row className="freight-summary-row">
            <Table.Summary.Cell index={0} />
            {FREIGHT_SUMMARY_COLUMN_KEYS.map((key, index) => {
              let content = null;

              if (key === "shipment_no") {
                content = summaryLoading ? "合计（计算中）" : "合计";
              }

              if (key === "volume") {
                content = summary ? formatSummaryVolume(summary.volume) : "—";
              }

              if (key === "total_fee") {
                content = summary ? formatSummaryMoney(summary.total_fee) : "—";
              }

              if (key === "bill_amount") {
                content = summary ? formatSummaryMoney(summary.bill_amount) : "—";
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
