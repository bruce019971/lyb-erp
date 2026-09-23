"use client";

import {
  BarcodeOutlined,
  CalculatorOutlined,
  DeleteOutlined,
  FilePdfOutlined,
  KeyOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ShoppingCartOutlined,
} from "@ant-design/icons";
import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import type { FormInstance } from "antd";
import { App, Button, Space, Switch, Table, Tooltip, Typography } from "antd";
import type { Key } from "react";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  batchGenerateShipmentCartonLabels,
  batchMarkShipmentInstructionsSubmitted,
  updateShipmentInstructionStatus,
  requestShipmentRecords,
  requestShipmentSummary,
  type ShipmentSummary,
} from "../_lib/shipments-request";
import { getShipmentColumns } from "./shipments-columns";
import {
  isShipmentDeliveryOverdue,
  canEditShipmentInstructionStatus,
  type ShipmentRecord,
} from "../_lib/shipments";
import type { ProductShipmentOption } from "../../products/_lib/products";
import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import type { StoreOption } from "../../stores/_lib/stores";
import {
  downloadShipmentCartonLabel,
  downloadShipmentLogisticsBoxMark,
} from "../_lib/carton-label";

type ShipmentsTableProps = {
  actionRef?: MutableRefObject<ShipmentsTableAction | undefined>;
  formRef?: MutableRefObject<FormInstance | undefined>;
  onCreate: () => void;
  onBatchLogisticsOrder: (records: ShipmentRecord[]) => void;
  onBatchCalculateGoodsValue: (ids: string[]) => void;
  onBatchDelete: (ids: string[]) => void;
  onClearCartonLabels: (ids: string[]) => void;
  onClearLogisticsBoxMarks: (ids: string[]) => void;
  onOpenRishenghuiAuth: () => void;
  hasRishenghuiAccessToken: boolean;
  onGenerateLogisticsBoxMark: (record: ShipmentRecord) => void;
  onLogisticsOrder: (record: ShipmentRecord) => void;
  onEdit: (record: ShipmentRecord) => void;
  onDelete: (record: ShipmentRecord) => void;
  onStartDeliveryStatusEdit: (record: ShipmentRecord) => void;
  onCancelDeliveryStatusEdit: () => void;
  onChangeDeliveryStatus: (record: ShipmentRecord, value: string) => void;
  onStartRelabelEdit: (record: ShipmentRecord) => void;
  onCancelRelabelEdit: () => void;
  onChangeRelabel: (record: ShipmentRecord, value: string) => void;
  isDeliveryStatusEditing: (record: ShipmentRecord) => boolean;
  isDeliveryStatusUpdating: (record: ShipmentRecord) => boolean;
  isRelabelEditing: (record: ShipmentRecord) => boolean;
  isRelabelUpdating: (record: ShipmentRecord) => boolean;
  isDeleting: (record: ShipmentRecord) => boolean;
  isBatchDeleting: boolean;
  isBatchSubmittingLogisticsOrder: boolean;
  isGeneratingCartonLabel: (record: ShipmentRecord) => boolean;
  isGeneratingLogisticsBoxMark: (record: ShipmentRecord) => boolean;
  isSubmittingLogisticsOrder: (record: ShipmentRecord) => boolean;
  onStartGenerateCartonLabel: (record: ShipmentRecord) => void;
  onFinishGenerateCartonLabel: () => void;
  storeOptions: StoreOption[];
  productOptions: ProductShipmentOption[];
  logisticsOptions: LogisticsProviderOption[];
};

const STORAGE_PREFIX = "mercado-inbound-planning:shipments";
const COLUMNS_STATE_STORAGE_KEY = `${STORAGE_PREFIX}:columns:v3`;
const SHIPMENTS_TABLE_SCROLL_Y_COLLAPSED = "calc(100vh - 360px)";
const SHIPMENTS_TABLE_SCROLL_Y_EXPANDED = "calc(100vh - 520px)";

type ShipmentColumnsState = Record<string, { show?: boolean }>;

export type ShipmentsTableAction = ActionType & {
  prependCreatedRecord: (record: ShipmentRecord) => boolean;
};

function isWarehouseArrivedUndelivered(record: ShipmentRecord) {
  const isWarehouseArrived =
    record.warehouse_arrived_status === "是" ||
    Boolean(record.overseas_warehouse_arrived_at);

  return isWarehouseArrived && record.delivery_status !== "是";
}

function hasSearchValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasSearchValue(item));
  }

  return typeof value === "string" ? Boolean(value.trim()) : Boolean(value);
}

function mergeSearchValues(
  values: Record<string, unknown>,
  formValues?: Record<string, unknown>,
) {
  if (!formValues) return values;

  return Object.entries(formValues).reduce(
    (merged, [key, value]) => {
      if (!hasSearchValue(merged[key]) && hasSearchValue(value)) {
        merged[key] = value;
      }

      return merged;
    },
    { ...values },
  );
}

function formatSummaryNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatSummaryMoney(value: number) {
  return `¥${value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function toFiniteNumber(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function hasActiveSearchValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasActiveSearchValue);
  if (typeof value === "string") return Boolean(value.trim());
  return value !== undefined && value !== null && value !== "";
}

function normalizeCreatedShipmentRecord(record: ShipmentRecord): ShipmentRecord {
  return {
    ...record,
    delivery_status: record.delivery_status ?? "否",
    relabel_delivery_times: [],
    is_delivery_completed: record.delivery_status === "是",
  };
}

function buildRequestParams(
  params: Record<string, unknown>,
  longTermInventoryOnly: boolean,
  expiringShipmentsOnly: boolean,
  localStoreNames: string[],
) {
  return {
    ...params,
    long_term_inventory: longTermInventoryOnly || undefined,
    expiring_shipments: expiringShipmentsOnly || undefined,
    expiring_local_store_names: expiringShipmentsOnly
      ? localStoreNames
      : undefined,
  };
}

type ShipmentSummaryColumnKey =
  | "shipment_no"
  | "product_name"
  | "order_store"
  | "box_count"
  | "pcs_per_box"
  | "total_qty"
  | "overseas_warehouse_arrived_at"
  | "appointment_time"
  | "is_relabel"
  | "instruction_submitted"
  | "delivery_status"
  | "goods_value"
  | "remark"
  | "created_at"
  | "updated_at";

const SHIPMENT_SUMMARY_COLUMN_KEYS: ShipmentSummaryColumnKey[] = [
  "created_at",
  "shipment_no",
  "product_name",
  "order_store",
  "box_count",
  "pcs_per_box",
  "total_qty",
  "overseas_warehouse_arrived_at",
  "appointment_time",
  "is_relabel",
  "instruction_submitted",
  "delivery_status",
  "goods_value",
  "remark",
  "updated_at",
];

function readShipmentColumnsState(): ShipmentColumnsState {
  if (typeof window === "undefined") return {};

  try {
    const value = window.localStorage.getItem(COLUMNS_STATE_STORAGE_KEY);
    return value ? (JSON.parse(value) as ShipmentColumnsState) : {};
  } catch {
    return {};
  }
}

export default function ShipmentsTable({
  actionRef,
  formRef,
  onCreate,
  onBatchLogisticsOrder,
  onBatchCalculateGoodsValue,
  onBatchDelete,
  onClearCartonLabels,
  onClearLogisticsBoxMarks,
  onOpenRishenghuiAuth,
  hasRishenghuiAccessToken,
  onGenerateLogisticsBoxMark,
  onLogisticsOrder,
  onEdit,
  onDelete,
  onStartDeliveryStatusEdit,
  onCancelDeliveryStatusEdit,
  onChangeDeliveryStatus,
  onStartRelabelEdit,
  onCancelRelabelEdit,
  onChangeRelabel,
  isDeliveryStatusEditing,
  isDeliveryStatusUpdating,
  isRelabelEditing,
  isRelabelUpdating,
  isDeleting,
  isBatchDeleting,
  isBatchSubmittingLogisticsOrder,
  isGeneratingCartonLabel,
  isGeneratingLogisticsBoxMark,
  isSubmittingLogisticsOrder,
  onStartGenerateCartonLabel,
  onFinishGenerateCartonLabel,
  storeOptions,
  productOptions,
  logisticsOptions,
}: ShipmentsTableProps) {
  const { message } = App.useApp();
  const handleDownloadCartonLabel = useCallback(
    async (record: ShipmentRecord) => {
      try {
        await downloadShipmentCartonLabel(record, storeOptions);
      } catch (error) {
        message.error(
          error instanceof Error ? error.message : "外箱标签下载失败",
        );
      }
    },
    [message, storeOptions],
  );
  const handleDownloadLogisticsBoxMark = useCallback(
    async (record: ShipmentRecord) => {
      try {
        await downloadShipmentLogisticsBoxMark(record, storeOptions);
      } catch (error) {
        message.error(
          error instanceof Error ? error.message : "物流箱唛下载失败",
        );
      }
    },
    [message, storeOptions],
  );
  const searchParamsRef = useRef<Record<string, unknown>>({});
  const [dataSource, setDataSource] = useState<ShipmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [editingInstructionId, setEditingInstructionId] = useState<string | null>(null);
  const [instructionUpdating, setInstructionUpdating] = useState(false);
  const [batchInstructionUpdating, setBatchInstructionUpdating] = useState(false);
  const [reloadRequest, setReloadRequest] = useState(0);
  const [summary, setSummary] = useState<ShipmentSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [searchCollapsed, setSearchCollapsed] = useState(true);
  const [longTermInventoryOnly, setLongTermInventoryOnly] = useState(false);
  const [expiringShipmentsOnly, setExpiringShipmentsOnly] = useState(false);
  const [columnsStateMap, setColumnsStateMap] = useState<ShipmentColumnsState>(
    () => readShipmentColumnsState(),
  );
  const localStoreNames = useMemo(
    () =>
      Array.from(
        new Set(
          storeOptions
            .filter((item) => item.seller_type?.trim() === "本土")
            .map((item) => item.seller_name.trim())
            .filter(Boolean),
        ),
      ),
    [storeOptions],
  );
  const selectedRecords = useMemo(() => {
    const selectedIdSet = new Set(selectedRowKeys.map((item) => String(item)));
    return dataSource.filter((item) => selectedIdSet.has(item.id));
  }, [dataSource, selectedRowKeys]);

  const selectedInstructionRecords = selectedRecords.filter(canEditShipmentInstructionStatus);

  const handleChangeInstructionStatus = useCallback(async (record: ShipmentRecord, value: string) => {
    if (instructionUpdating) return;
    if ((record.instruction_submitted ?? "否") === value) {
      setEditingInstructionId(null);
      return;
    }
    setInstructionUpdating(true);
    try {
      const updated = await updateShipmentInstructionStatus(record, value);
      setDataSource((current) => current.map((item) => item.id === updated.id
        ? { ...item, ...updated }
        : item));
      setEditingInstructionId(null);
      message.success("是否提交指令已更新");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "是否提交指令更新失败");
    } finally {
      setInstructionUpdating(false);
    }
  }, [instructionUpdating, message]);

  async function handleBatchInstructionStatus() {
    if (instructionUpdating || loading || !selectedInstructionRecords.length) return;
    setInstructionUpdating(true);
    setBatchInstructionUpdating(true);
    setEditingInstructionId(null);
    try {
      const { succeeded, failures } = await batchMarkShipmentInstructionsSubmitted(selectedInstructionRecords);
      const updatedById = new Map(succeeded.map((record) => [record.id, record]));
      setDataSource((current) => current.map((item) => {
        const updated = updatedById.get(item.id);
        return updated ? { ...item, ...updated } : item;
      }));
      setSelectedRowKeys((current) => current.filter((id) => !updatedById.has(String(id))));
      const skipped = selectedRecords.length - selectedInstructionRecords.length;
      const summary = `已将 ${succeeded.length} 条货件的是否提交指令设置为“是”`;
      if (failures.length) {
        message.error(`${summary}，失败 ${failures.length} 条：${failures[0].message}。未完成的记录仍保留勾选。`, 8);
      } else {
        message.success(skipped ? `${summary}；跳过 ${skipped} 条未设置送仓时间的货件` : summary);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "批量设置已提交指令失败");
    } finally {
      setInstructionUpdating(false);
      setBatchInstructionUpdating(false);
    }
  }

  function isColumnVisible(key: string) {
    return columnsStateMap[key]?.show !== false;
  }

  const updateShipmentRow = useCallback(
    (shipmentNo: string, values: Partial<ShipmentRecord>) => {
      setDataSource((current) =>
        current.map((item) =>
          item.shipment_no?.trim() === shipmentNo ? { ...item, ...values } : item,
        ),
      );
    },
    [],
  );

  const loadRecords = useCallback(
    async (params: Record<string, unknown>) => {
      setLoading(true);

      try {
        setSummaryLoading(true);
        const requestParams = buildRequestParams(
          params,
          longTermInventoryOnly,
          expiringShipmentsOnly,
          localStoreNames,
        );

        const [result, summaryResult] = await Promise.all([
          requestShipmentRecords(requestParams, {}, {}),
          requestShipmentSummary(requestParams),
        ]);

        setSummary(summaryResult);
        setSummaryLoading(false);

        const nextData = result.data ?? [];
        setDataSource(nextData);
        setSelectedRowKeys([]);
      } finally {
        setLoading(false);
        setSummaryLoading(false);
      }
    },
    [expiringShipmentsOnly, localStoreNames, longTermInventoryOnly],
  );

  const reloadFirstPage = useCallback(async () => {
    await loadRecords(searchParamsRef.current);
  }, [loadRecords]);

  const prependCreatedRecord = useCallback((record: ShipmentRecord) => {
    const hasActiveSearch = Object.values(searchParamsRef.current).some(
      hasActiveSearchValue,
    );

    if (hasActiveSearch || longTermInventoryOnly || expiringShipmentsOnly) {
      return false;
    }

    const normalizedRecord = normalizeCreatedShipmentRecord(record);

    setDataSource((current) => {
      if (current.some((item) => item.id === normalizedRecord.id)) {
        return current;
      }

      return [normalizedRecord, ...current];
    });
    setSummary((current) =>
      current
        ? {
            boxCount: Number(
              (
                current.boxCount + toFiniteNumber(normalizedRecord.box_count)
              ).toFixed(2),
            ),
            totalQty: Number(
              (
                current.totalQty + toFiniteNumber(normalizedRecord.total_qty)
              ).toFixed(2),
            ),
            goodsValue: Number(
              (
                current.goodsValue + toFiniteNumber(normalizedRecord.goods_value)
              ).toFixed(2),
            ),
            total: current.total + 1,
          }
        : current,
    );
    setSelectedRowKeys([]);

    return true;
  }, [expiringShipmentsOnly, longTermInventoryOnly]);

  const handleGenerateCartonLabel = useCallback(
    async (record: ShipmentRecord) => {
      const shipmentNo = record.shipment_no?.trim();

      if (!shipmentNo) {
        message.error("当前货件缺少货件号");
        return;
      }

      try {
        onStartGenerateCartonLabel(record);
        const result = await batchGenerateShipmentCartonLabels([shipmentNo]);
        const failedItem = result.results.find((item) => !item.success);

        if (failedItem) {
          throw new Error(failedItem.error || "外箱标签生成失败");
        }

        const successItem = result.results.find(
          (item) => item.success && item.shipmentNo === shipmentNo,
        );

        if (successItem?.url) {
          updateShipmentRow(shipmentNo, {
            carton_label_url: successItem.url,
          });
        }

        message.success(`${shipmentNo}外箱标签生成成功`);
        setReloadRequest((value) => value + 1);
      } catch (error) {
        message.error(
          error instanceof Error ? error.message : "外箱标签生成失败",
        );
      } finally {
        onFinishGenerateCartonLabel();
      }
    },
    [
      message,
      onFinishGenerateCartonLabel,
      onStartGenerateCartonLabel,
      updateShipmentRow,
    ],
  );

  const columns = useMemo(
    () =>
      getShipmentColumns(
        onEdit,
        handleDownloadCartonLabel,
        handleDownloadLogisticsBoxMark,
        handleGenerateCartonLabel,
        onGenerateLogisticsBoxMark,
        onLogisticsOrder,
        onDelete,
        onStartDeliveryStatusEdit,
        onCancelDeliveryStatusEdit,
        onChangeDeliveryStatus,
        onStartRelabelEdit,
        onCancelRelabelEdit,
        onChangeRelabel,
        isDeliveryStatusEditing,
        isDeliveryStatusUpdating,
        isRelabelEditing,
        isRelabelUpdating,
        isDeleting,
        isGeneratingCartonLabel,
        isGeneratingLogisticsBoxMark,
        isSubmittingLogisticsOrder,
        storeOptions,
        productOptions,
        logisticsOptions,
        {
          editingId: editingInstructionId,
          updating: instructionUpdating,
          onStart: (record) => setEditingInstructionId(record.id),
          onCancel: () => setEditingInstructionId(null),
          onChange: (record, value) => void handleChangeInstructionStatus(record, value),
        },
      ),
    [
      editingInstructionId,
      instructionUpdating,
      handleChangeInstructionStatus,
      isDeleting,
      isDeliveryStatusEditing,
      isDeliveryStatusUpdating,
      isRelabelEditing,
      isRelabelUpdating,
      logisticsOptions,
      handleDownloadCartonLabel,
      handleDownloadLogisticsBoxMark,
      handleGenerateCartonLabel,
      isGeneratingCartonLabel,
      isGeneratingLogisticsBoxMark,
      isSubmittingLogisticsOrder,
      onCancelDeliveryStatusEdit,
      onCancelRelabelEdit,
      onChangeDeliveryStatus,
      onChangeRelabel,
      onDelete,
      onEdit,
      onGenerateLogisticsBoxMark,
      onLogisticsOrder,
      onStartDeliveryStatusEdit,
      onStartRelabelEdit,
      productOptions,
      storeOptions,
    ],
  );

  useEffect(() => {
    void reloadFirstPage();
  }, [reloadFirstPage]);

  useEffect(() => {
    if (reloadRequest === 0) return;

    void reloadFirstPage();
  }, [reloadFirstPage, reloadRequest]);

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
      prependCreatedRecord,
    } as ShipmentsTableAction;

    return () => {
      actionRef.current = undefined;
    };
  }, [actionRef, loadRecords, prependCreatedRecord, reloadFirstPage]);

  return (
    <ProTable<ShipmentRecord>
      className="shipments-table-with-sticky-summary"
      formRef={formRef}
      rowKey="id"
      size="small"
      headerTitle={
        <Space size={16} wrap>
          <Space size={8}>
            <Typography.Text>长期库存</Typography.Text>
            <Tooltip title="到仓25天及以上没有送仓的货件">
              <QuestionCircleOutlined className="text-slate-400" />
            </Tooltip>
            <Switch
              size="small"
              checked={longTermInventoryOnly}
              onChange={setLongTermInventoryOnly}
            />
          </Space>
          <Space size={8}>
            <Typography.Text>临期货件</Typography.Text>
            <Tooltip title="本土店铺中创建时间超过54天且未约仓的货件">
              <QuestionCircleOutlined className="text-slate-400" />
            </Tooltip>
            <Switch
              size="small"
              checked={expiringShipmentsOnly}
              onChange={setExpiringShipmentsOnly}
            />
          </Space>
        </Space>
      }
      columns={columns}
      dataSource={dataSource}
      loading={loading || batchInstructionUpdating}
      rowSelection={{
        type: "checkbox",
        selectedRowKeys,
        preserveSelectedRowKeys: true,
        getCheckboxProps: () => ({ disabled: instructionUpdating }),
        onChange: (keys) => {
          setSelectedRowKeys(keys);
        },
      }}
      rowClassName={(record) => {
        if (record.is_delivery_completed || record.delivery_status === "是") return "shipment-delivered-row";
        if (record.instruction_submitted === "是") {
          return isWarehouseArrivedUndelivered(record)
            ? "shipment-warehouse-pending-delivery-row shipment-instruction-submitted-row"
            : "shipment-instruction-submitted-row";
        }
        if (isShipmentDeliveryOverdue(record)) {
          return isWarehouseArrivedUndelivered(record)
            ? "shipment-warehouse-pending-delivery-row shipment-delivery-overdue-row"
            : "shipment-delivery-overdue-row";
        }
        if (isWarehouseArrivedUndelivered(record)) {
          return "shipment-warehouse-pending-delivery-row";
        }
        return "";
      }}
      tableAlertRender={false}
      tableAlertOptionRender={false}
      summary={() =>
        summary
          ? (() => {
              let cellIndex = 0;
              const visibleSummaryColumns =
                SHIPMENT_SUMMARY_COLUMN_KEYS.filter(isColumnVisible);
              const leadingColumnKey = visibleSummaryColumns[0];

              return (
                <Table.Summary fixed="bottom">
                  <Table.Summary.Row className="shipment-summary-row">
                    <Table.Summary.Cell index={cellIndex++} />
                    {visibleSummaryColumns.map((key) => {
                      let content = null;

                      if (key === leadingColumnKey) {
                        content = (
                          <span className="text-slate-700">
                            合计{summaryLoading ? "（计算中）" : ""}
                          </span>
                        );
                      }

                      if (key === "box_count") {
                        content = formatSummaryNumber(summary.boxCount);
                      }

                      if (key === "total_qty") {
                        content = formatSummaryNumber(summary.totalQty);
                      }

                      if (key === "goods_value") {
                        content = formatSummaryMoney(summary.goodsValue);
                      }

                      return (
                        <Table.Summary.Cell key={key} index={cellIndex++}>
                          {content}
                        </Table.Summary.Cell>
                      );
                    })}
                    <Table.Summary.Cell index={cellIndex} />
                  </Table.Summary.Row>
                </Table.Summary>
              );
            })()
          : null
      }
      columnsState={{
        persistenceKey: COLUMNS_STATE_STORAGE_KEY,
        persistenceType: "localStorage",
        onChange: (value) =>
          setColumnsStateMap(value as ShipmentColumnsState),
      }}
      scroll={{
        x: 1910,
        y: searchCollapsed
          ? SHIPMENTS_TABLE_SCROLL_Y_COLLAPSED
          : SHIPMENTS_TABLE_SCROLL_Y_EXPANDED,
      }}
      search={{
        labelWidth: "auto",
        defaultCollapsed: true,
        defaultColsNumber: 3,
        onCollapse: (collapsed) => setSearchCollapsed(collapsed),
      }}
      onSubmit={(values) => {
        const nextValues = mergeSearchValues(
          values,
          formRef?.current?.getFieldsValue?.(),
        );

        searchParamsRef.current = nextValues;
        void loadRecords(nextValues);
      }}
      onReset={() => {
        searchParamsRef.current = {};
        void loadRecords({});
      }}
      options={{
        density: false,
        fullScreen: false,
        reload: false,
        setting: true,
      }}
      toolBarRender={() => {
        const selectedIds = selectedRowKeys
          .map((item) => String(item))
          .filter(Boolean);
        const hasSelectedRows = selectedIds.length > 0;
        const actions = [
          <Button
            key="batch-instruction-submitted"
            disabled={loading || instructionUpdating || !selectedInstructionRecords.length}
            loading={batchInstructionUpdating}
            onClick={() => void handleBatchInstructionStatus()}
          >
            批量设置已提交指令
          </Button>,
          <Tooltip key="create" title="新增货件">
            <Button type="text" icon={<PlusOutlined />} onClick={onCreate} />
          </Tooltip>,
          <Tooltip
            key="batch-logistics-order"
            title={
              hasSelectedRows ? "批量物流下单" : "请先选择需要下单的货件"
            }
          >
            <Button
              type="primary"
              disabled={!hasSelectedRows}
              loading={isBatchSubmittingLogisticsOrder}
              icon={<ShoppingCartOutlined />}
              onClick={() => onBatchLogisticsOrder(selectedRecords)}
            >
              批量物流下单
            </Button>
          </Tooltip>,
          <Tooltip
            key="calculate-goods-value"
            title={
              hasSelectedRows ? "计算货物价值" : "请先选择需要处理的货件"
            }
          >
            <Button
              type="text"
              disabled={!hasSelectedRows}
              icon={<CalculatorOutlined />}
              onClick={() => onBatchCalculateGoodsValue(selectedIds)}
            />
          </Tooltip>,
          <Tooltip
            key="batch-delete"
            title={hasSelectedRows ? "删除货件" : "请先选择需要删除的货件"}
          >
            <Button
              type="text"
              danger
              disabled={!hasSelectedRows}
              loading={isBatchDeleting}
              icon={<DeleteOutlined />}
              onClick={() => onBatchDelete(selectedIds)}
            />
          </Tooltip>,
          <Tooltip
            key="clear-carton-labels"
            title={
              hasSelectedRows ? "删除外箱标签" : "请先选择需要处理的货件"
            }
          >
            <Button
              type="text"
              danger
              disabled={!hasSelectedRows}
              icon={<FilePdfOutlined />}
              onClick={() => onClearCartonLabels(selectedIds)}
            />
          </Tooltip>,
          <Tooltip
            key="clear-logistics-box-marks"
            title={
              hasSelectedRows ? "删除物流箱唛" : "请先选择需要处理的货件"
            }
          >
            <Button
              type="text"
              danger
              disabled={!hasSelectedRows}
              icon={<BarcodeOutlined />}
              onClick={() => onClearLogisticsBoxMarks(selectedIds)}
            />
          </Tooltip>,
          <Tooltip
            key="rishenghui-auth"
            title={hasRishenghuiAccessToken ? "更新日升辉Token" : "获取日升辉Token"}
          >
            <Button
              type="text"
              icon={<KeyOutlined />}
              onClick={onOpenRishenghuiAuth}
            />
          </Tooltip>,
        ];

        return actions;
      }}
      pagination={false}
      dateFormatter="string"
    />
  );
}
