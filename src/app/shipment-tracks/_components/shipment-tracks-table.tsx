"use client";

import type { ActionType } from "@ant-design/pro-components";
import { SyncOutlined } from "@ant-design/icons";
import { ProTable } from "@ant-design/pro-components";
import { useServerTable } from "@/hooks/use-server-table";
import {
  App,
  Button,
  Empty,
  Modal,
  Space,
  Steps,
  Switch,
  Table,
  Typography,
} from "antd";
import type { Dayjs } from "dayjs";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ShipmentTrackFilterOptions } from "../_lib/shipment-tracks-request";
import {
  getRequiredTangchaoAuthKey,
  requestShipmentTrackRecords,
  requestShipmentTrackSummary,
  updateShipmentTrackRecord,
  updateTangchaoShipmentTrack,
  updateRishenghuiShipmentTrack,
  updateSaleasyShipmentTrack,
  updateTongtuShipmentTrack,
} from "../_lib/shipment-tracks-request";
import {
  canEditEstimatedDelivery,
  isValidEstimatedDuration,
  isValidEstimatedDeliveryDate,
  type ShipmentTrackEditableField,
  formatShipmentTrackDateTime,
  type ShipmentTrackRecord,
} from "../_lib/shipment-tracks";
import { getShipmentTrackColumns } from "./shipment-tracks-columns";

type ShipmentTracksTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  shipmentOptions: ShipmentTrackFilterOptions;
  rishenghuiAccessToken: string;
  onRequireRishenghuiToken: (
    content?: string,
    pendingAction?: (accessToken: string) => void | Promise<void>,
  ) => void;
};

const SHIPMENT_TRACKS_TABLE_SCROLL_Y_COLLAPSED = "calc(100vh - 328px)";
const SHIPMENT_TRACKS_TABLE_SCROLL_Y_EXPANDED = "calc(100vh - 468px)";
const TRACK_UPDATE_PROVIDER_NAMES = ["赛易", "日升辉", "通途", "唐朝"];
const COLUMNS_STATE_STORAGE_KEY =
  "mercado-inbound-planning:shipment-tracks:columns:v1";
type ShipmentTrackColumnsState = Record<string, { show?: boolean }>;
type ShipmentTrackSummaryColumnKey =
  | "shipment_no"
  | "product_name"
  | "total_qty"
  | "order_store"
  | "latest_track"
  | "sailing_time"
  | "warehouse_arrived_time"
  | "estimated_duration_days"
  | "estimated_warehouse_arrived_time"
  | "estimated_delivery_time"
  | "duration_days"
  | "created_at";

const SHIPMENT_TRACK_SUMMARY_COLUMN_KEYS: ShipmentTrackSummaryColumnKey[] = [
  "shipment_no",
  "product_name",
  "created_at",
  "total_qty",
  "order_store",
  "latest_track",
  "sailing_time",
  "warehouse_arrived_time",
  "estimated_duration_days",
  "estimated_warehouse_arrived_time",
  "estimated_delivery_time",
  "duration_days",
];

function buildSelectOptions(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((item) => item?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  ).map((value) => ({ label: value, value }));
}

function formatSummaryNumber(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function readShipmentTrackColumnsState(): ShipmentTrackColumnsState {
  if (typeof window === "undefined") return {};

  try {
    const value = window.localStorage.getItem(COLUMNS_STATE_STORAGE_KEY);
    return value ? (JSON.parse(value) as ShipmentTrackColumnsState) : {};
  } catch {
    return {};
  }
}

export default function ShipmentTracksTable({
  actionRef,
  onRequireRishenghuiToken,
  rishenghuiAccessToken,
  shipmentOptions,
}: ShipmentTracksTableProps) {
  const searchParamsRef = useRef<Record<string, unknown>>({});
  const [columnsStateMap, setColumnsStateMap] =
    useState<ShipmentTrackColumnsState>(() => readShipmentTrackColumnsState());
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [showOverdueShipments, setShowOverdueShipments] = useState(false);
  const [showDeliveredShipments, setShowDeliveredShipments] = useState(false);
  const [updatingTrackIds, setUpdatingTrackIds] = useState<string[]>([]);
  const [updatingTrackDateKeys, setUpdatingTrackDateKeys] = useState<string[]>(
    [],
  );
  const [editingTrackDateKey, setEditingTrackDateKey] = useState<string | null>(
    null,
  );
  const [trackDetailsRecord, setTrackDetailsRecord] =
    useState<ShipmentTrackRecord | null>(null);
  const [searchCollapsed, setSearchCollapsed] = useState(true);
  const { message: messageApi } = App.useApp();
  const buildParams = useCallback((params: Record<string, unknown>) => ({
    ...params,
    show_overdue_shipments: showOverdueShipments,
    show_delivered_shipments: showDeliveredShipments,
  }), [showOverdueShipments, showDeliveredShipments]);
  const {
    dataSource, setDataSource, loading, summary, summaryLoading,
    selectedRowKeys: selectedTrackIds, setSelectedRowKeys: setSelectedTrackIds,
    selectedRecords: selectedTrackRecords, onSelectionChange,
    loadRecords, reload, refresh, pagination, onTableChange,
  } = useServerTable({ request: requestShipmentTrackRecords, requestSummary: requestShipmentTrackSummary, buildParams });

  function isColumnVisible(key: string) {
    return columnsStateMap[key]?.show !== false;
  }

  const trackDetailEvents = useMemo(
    () =>
      [...(trackDetailsRecord?.track_events ?? [])].sort((left, right) => {
        const leftTime = left.time ? Date.parse(left.time) : 0;
        const rightTime = right.time ? Date.parse(right.time) : 0;

        return rightTime - leftTime;
      }),
    [trackDetailsRecord],
  );

  const handleOpenTrackDetails = useCallback((record: ShipmentTrackRecord) => {
    setTrackDetailsRecord(record);
  }, []);

  const requestTrackUpdate = useCallback(async (
    record: ShipmentTrackRecord,
    token: string,
  ) => {
    const providerName = record.logistics_provider?.trim();
    if (!providerName || !TRACK_UPDATE_PROVIDER_NAMES.includes(providerName)) {
      throw new Error("当前物流商不支持更新轨迹");
    }

    const result =
      providerName === "日升辉"
        ? await updateRishenghuiShipmentTrack({
            trackId: record.id,
            accessToken: token,
          })
        : providerName === "通途"
          ? await updateTongtuShipmentTrack({ trackId: record.id })
        : providerName === "唐朝"
          ? await updateTangchaoShipmentTrack({
              trackId: record.id,
              authKey: await getRequiredTangchaoAuthKey(),
            })
        : await updateSaleasyShipmentTrack({ trackId: record.id });

    return result.record;
  }, []);

  const runUpdateTrack = useCallback(async (
    record: ShipmentTrackRecord,
    token: string,
  ) => {
    setUpdatingTrackIds((current) =>
      current.includes(record.id) ? current : [...current, record.id],
    );

    try {
      const nextRecord = await requestTrackUpdate(record, token);
      setDataSource((current) =>
        current.map((item) =>
          item.id === nextRecord.id ? nextRecord : item,
        ),
      );
      messageApi.success(`${record.shipment_no || "货件"}轨迹更新成功`);
      await refresh();
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "轨迹更新失败";
      const requiresRishenghuiToken =
        record.logistics_provider?.trim() === "日升辉" &&
        /token|access.?token|authorization|unauthorized|401|403|登录|认证|过期|失效|无效|未授权|权限|身份/i.test(
          description,
        );

      if (requiresRishenghuiToken) {
        onRequireRishenghuiToken(description);
      } else {
        messageApi.error(description);
      }
    } finally {
      setUpdatingTrackIds((current) => current.filter((id) => id !== record.id));
    }
  }, [messageApi, onRequireRishenghuiToken, requestTrackUpdate, setDataSource, refresh]);

  const handleUpdateTrack = useCallback(async (
    record: ShipmentTrackRecord,
    accessTokenOverride?: string,
  ) => {
    const providerName = record.logistics_provider?.trim();
    const token = accessTokenOverride?.trim() || rishenghuiAccessToken.trim();

    if (providerName === "日升辉" && !token) {
      onRequireRishenghuiToken(undefined, (accessToken) =>
        runUpdateTrack(record, accessToken),
      );
      return;
    }

    await runUpdateTrack(record, token);
  }, [
    onRequireRishenghuiToken,
    rishenghuiAccessToken,
    runUpdateTrack,
  ]);

  const handleBatchUpdateTracks = useCallback(async (
    records: ShipmentTrackRecord[],
    token: string,
  ) => {
    setBatchUpdating(true);
    setUpdatingTrackIds((current) =>
      Array.from(new Set([...current, ...records.map((item) => item.id)])),
    );

    const failures: Array<{ shipmentNo: string; error: string }> = [];
    let successCount = 0;

    try {
      for (const record of records) {
        try {
          const nextRecord = await requestTrackUpdate(record, token);
          successCount += 1;
          setDataSource((current) =>
            current.map((item) =>
              item.id === nextRecord.id ? nextRecord : item,
            ),
          );
        } catch (error) {
          failures.push({
            shipmentNo: record.shipment_no || record.tracking_no || record.id,
            error: error instanceof Error ? error.message : "轨迹更新失败",
          });
        }
      }
    } finally {
      setUpdatingTrackIds((current) =>
        current.filter(
          (id) => !records.some((record) => record.id === id),
        ),
      );
      setBatchUpdating(false);
      setSelectedTrackIds([]);
    }

    if (successCount > 0) {
      await refresh();
      messageApi.success(`轨迹批量更新完成：成功 ${successCount} 个`);
    }

    if (failures.length > 0) {
      Modal.warning({
        title: "部分货件轨迹更新失败",
        content: (
          <div className="max-h-72 overflow-auto">
            {failures.map((item) => (
              <div key={item.shipmentNo} className="mb-1">
                {item.shipmentNo}：{item.error}
              </div>
            ))}
          </div>
        ),
      });
    }
  }, [
    messageApi,
    requestTrackUpdate,
    setDataSource,
    setSelectedTrackIds,
    refresh,
  ]);

  const handleBatchUpdateTracksClick = useCallback(() => {
    if (!selectedTrackRecords.length) {
      messageApi.warning("请先选择需要更新轨迹的货件");
      return;
    }

    const hasRishenghui = selectedTrackRecords.some(
      (item) => item.logistics_provider?.trim() === "日升辉",
    );
    const token = rishenghuiAccessToken.trim();

    if (hasRishenghui && !token) {
      onRequireRishenghuiToken(undefined, (accessToken) =>
        handleBatchUpdateTracks(selectedTrackRecords, accessToken),
      );
      return;
    }

    void handleBatchUpdateTracks(selectedTrackRecords, token);
  }, [
    handleBatchUpdateTracks,
    messageApi,
    onRequireRishenghuiToken,
    rishenghuiAccessToken,
    selectedTrackRecords,
  ]);

  const isUpdatingTrack = useCallback(
    (record: ShipmentTrackRecord) => updatingTrackIds.includes(record.id),
    [updatingTrackIds],
  );

  const getTrackDateKey = useCallback(
    (record: ShipmentTrackRecord, field: ShipmentTrackEditableField) =>
      `${record.id}:${field}`,
    [],
  );

  const handleStartTrackDateEdit = useCallback((
    record: ShipmentTrackRecord,
    field: ShipmentTrackEditableField,
  ) => {
    if (isUpdatingTrack(record) || updatingTrackDateKeys.length > 0) return;
    if (field === "estimated_delivery_time" && !canEditEstimatedDelivery(record)) return;
    setEditingTrackDateKey(getTrackDateKey(record, field));
  }, [getTrackDateKey, isUpdatingTrack, updatingTrackDateKeys]);

  const handleCancelTrackDateEdit = useCallback((
    record: ShipmentTrackRecord,
    field: ShipmentTrackEditableField,
  ) => {
    const editKey = getTrackDateKey(record, field);
    setEditingTrackDateKey((current) =>
      current === editKey ? null : current,
    );
  }, [getTrackDateKey]);

  const handleChangeTrackDate = useCallback(async (
    record: ShipmentTrackRecord,
    field: ShipmentTrackEditableField,
    value: Dayjs | number | null,
  ) => {
    if (field === "estimated_duration_days" && !isValidEstimatedDuration(value)) {
      messageApi.error("预计时效天数必须为正整数（不超过2147483647）");
      return;
    }
    const nextValue = typeof value === "number" ? value : value ? value.format("YYYY-MM-DD") : null;
    if (field === "estimated_delivery_time" && (
      !canEditEstimatedDelivery(record) ||
      (typeof nextValue === "string" && !isValidEstimatedDeliveryDate(record.estimated_warehouse_arrived_time, nextValue))
    )) {
      messageApi.error("仅清关中的货件可编辑，且预计送仓时间须至少晚于预计到仓时间2天");
      return;
    }
    const currentValue = record[field] ?? null;
    const updateKey = getTrackDateKey(record, field);

    if (nextValue === currentValue) {
      setEditingTrackDateKey((current) =>
        current === updateKey ? null : current,
      );
      return;
    }

    setUpdatingTrackDateKeys((current) =>
      current.includes(updateKey) ? current : [...current, updateKey],
    );

    try {
      const nextRecord = await updateShipmentTrackRecord(record.id, {
        [field]: nextValue,
      });
      setDataSource((current) =>
        current.map((item) =>
          item.id === nextRecord.id ? nextRecord : item,
        ),
      );
      messageApi.success("货件轨迹更新成功");
      await refresh();
    } catch (error) {
      messageApi.error(
        error instanceof Error ? error.message : "货件轨迹更新失败",
      );
    } finally {
      setUpdatingTrackDateKeys((current) =>
        current.filter((key) => key !== updateKey),
      );
      setEditingTrackDateKey((current) =>
        current === updateKey ? null : current,
      );
    }
  }, [getTrackDateKey, messageApi, setDataSource, refresh]);

  const isTrackDateEditing = useCallback(
    (record: ShipmentTrackRecord, field: ShipmentTrackEditableField) =>
      editingTrackDateKey === getTrackDateKey(record, field),
    [editingTrackDateKey, getTrackDateKey],
  );

  const isTrackDateUpdating = useCallback(
    (record: ShipmentTrackRecord, field: ShipmentTrackEditableField) =>
      updatingTrackDateKeys.includes(getTrackDateKey(record, field)),
    [getTrackDateKey, updatingTrackDateKeys],
  );

  const orderStoreOptions = useMemo(
    () => buildSelectOptions(shipmentOptions.order_stores),
    [shipmentOptions],
  );
  const productSelectOptions = useMemo(
    () => buildSelectOptions(shipmentOptions.product_names),
    [shipmentOptions],
  );
  const logisticsProviderOptions = useMemo(
    () =>
      buildSelectOptions(
        shipmentOptions.logistics_providers,
      ),
    [shipmentOptions],
  );
  const columns = useMemo(
    () =>
      getShipmentTrackColumns(
        handleUpdateTrack,
        handleOpenTrackDetails,
        handleChangeTrackDate,
        handleStartTrackDateEdit,
        handleCancelTrackDateEdit,
        isTrackDateEditing,
        isUpdatingTrack,
        isTrackDateUpdating,
        orderStoreOptions,
        productSelectOptions,
        logisticsProviderOptions,
      ),
    [
      handleChangeTrackDate,
      handleStartTrackDateEdit,
      handleCancelTrackDateEdit,
      handleOpenTrackDetails,
      handleUpdateTrack,
      isTrackDateEditing,
      isUpdatingTrack,
      isTrackDateUpdating,
      orderStoreOptions,
      productSelectOptions,
      logisticsProviderOptions,
    ],
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
    <>
      <ProTable<ShipmentTrackRecord>
        className="shipment-tracks-table-with-sticky-summary"
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={dataSource}
        loading={loading}
        rowClassName={(record) => [
          record.warehouse_arrived_time?.trim() || record.latest_track?.trim() === "已到仓"
            ? "shipment-track-arrived-row"
            : "",
          record.delivery_status === "是" ? "shipment-delivered-row" : "",
        ].filter(Boolean).join(" ")}
        rowSelection={{
          selectedRowKeys: selectedTrackIds,
          preserveSelectedRowKeys: true,
          onChange: onSelectionChange,
          getCheckboxProps: (record) => ({
            disabled: batchUpdating || isUpdatingTrack(record),
          }),
        }}
        tableAlertRender={false}
        tableAlertOptionRender={false}
        search={{
          labelWidth: "auto",
          defaultCollapsed: true,
          defaultColsNumber: 3,
          onCollapse: (collapsed) => setSearchCollapsed(collapsed),
        }}
        onSubmit={(values) => {
          searchParamsRef.current = values;
          void loadRecords(values);
        }}
        onReset={() => {
          searchParamsRef.current = {};
          void loadRecords({});
        }}
        options={{
          density: false,
          fullScreen: false,
          reload: () => { void reload(); },
          setting: true,
        }}
        columnsState={{
          persistenceKey: COLUMNS_STATE_STORAGE_KEY,
          persistenceType: "localStorage",
          onChange: (value) =>
            setColumnsStateMap(value as ShipmentTrackColumnsState),
        }}
        toolBarRender={() => [
          <Space key="batch-track-actions">
            <Typography.Text type="secondary">超时货件</Typography.Text>
            <Switch
              aria-label="超时货件"
              size="small"
              checked={showOverdueShipments}
              onChange={setShowOverdueShipments}
            />
            <Typography.Text type="secondary">显示已送仓</Typography.Text>
            <Switch
              size="small"
              checked={showDeliveredShipments}
              onChange={setShowDeliveredShipments}
            />
            <Typography.Text type="secondary">
              已选 {selectedTrackRecords.length} 个
            </Typography.Text>
            <Button
              type="primary"
              icon={<SyncOutlined />}
              loading={batchUpdating}
              disabled={!selectedTrackRecords.length}
              onClick={handleBatchUpdateTracksClick}
            >
              批量更新轨迹
            </Button>
          </Space>,
        ]}
        scroll={{
          x: 1830,
          y: searchCollapsed
            ? SHIPMENT_TRACKS_TABLE_SCROLL_Y_COLLAPSED
            : SHIPMENT_TRACKS_TABLE_SCROLL_Y_EXPANDED,
        }}
        summary={() =>
          summary
            ? (() => {
                let cellIndex = 0;
                const visibleSummaryColumns =
                  SHIPMENT_TRACK_SUMMARY_COLUMN_KEYS.filter(isColumnVisible);
                const leadingColumnKey = visibleSummaryColumns[0];

                return (
                  <Table.Summary fixed="bottom">
                    <Table.Summary.Row className="shipment-track-summary-row">
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

                        if (key === "total_qty") {
                          content = formatSummaryNumber(summary.totalQty);
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
        pagination={pagination}
        onChange={onTableChange}
        dateFormatter="string"
      />
      <Modal
        title="轨迹详情"
        open={Boolean(trackDetailsRecord)}
        footer={null}
        width={680}
        onCancel={() => setTrackDetailsRecord(null)}
      >
        <div className="mb-4 flex flex-col gap-1">
          <Typography.Text strong>
            {trackDetailsRecord?.shipment_no || "-"}
          </Typography.Text>
          <Typography.Text type="secondary">
            {trackDetailsRecord?.tracking_no || "-"}
          </Typography.Text>
        </div>
        <div className="max-h-[60vh] overflow-y-auto pr-2">
          {trackDetailEvents.length ? (
            <Steps
              progressDot
              direction="vertical"
              current={0}
              items={trackDetailEvents.map((item) => ({
                title: item.time
                  ? formatShipmentTrackDateTime(item.time)
                  : "时间未知",
                description: item.content,
              }))}
            />
          ) : (
            <Empty description="暂无轨迹明细" />
          )}
        </div>
      </Modal>
    </>
  );
}
