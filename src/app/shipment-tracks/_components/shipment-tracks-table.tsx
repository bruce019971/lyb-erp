"use client";

import type { ActionType } from "@ant-design/pro-components";
import { SyncOutlined } from "@ant-design/icons";
import { ProTable } from "@ant-design/pro-components";
import { App, Button, Empty, Modal, Space, Steps, Typography } from "antd";
import type { Dayjs } from "dayjs";
import type { Key, MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ShipmentOption } from "../../shipments/_lib/shipments";
import {
  getRequiredTangchaoAuthKey,
  requestShipmentTrackRecords,
  updateShipmentTrackRecord,
  updateTangchaoShipmentTrack,
  updateRishenghuiShipmentTrack,
  updateSaleasyShipmentTrack,
  updateTongtuShipmentTrack,
} from "../_lib/shipment-tracks-request";
import {
  formatShipmentTrackDate,
  formatShipmentTrackDateTime,
  type ShipmentTrackRecord,
} from "../_lib/shipment-tracks";
import { getShipmentTrackColumns } from "./shipment-tracks-columns";

type ShipmentTracksTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  shipmentOptions: ShipmentOption[];
  rishenghuiAccessToken: string;
  onRequireRishenghuiToken: (
    content?: string,
    pendingAction?: (accessToken: string) => void | Promise<void>,
  ) => void;
};

const SHIPMENT_TRACKS_TABLE_SCROLL_Y_COLLAPSED = "calc(100vh - 280px)";
const SHIPMENT_TRACKS_TABLE_SCROLL_Y_EXPANDED = "calc(100vh - 420px)";
const TRACK_UPDATE_PROVIDER_NAMES = ["赛易", "日升辉", "通途", "唐朝"];
type ShipmentTrackDateField = "sailing_time" | "warehouse_arrived_time";

function buildSelectOptions(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((item) => item?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  ).map((value) => ({ label: value, value }));
}

function canUpdateShipmentTrack(record: ShipmentTrackRecord) {
  const providerName = record.logistics_provider?.trim();
  return Boolean(
    providerName &&
      TRACK_UPDATE_PROVIDER_NAMES.includes(providerName) &&
      !record.warehouse_arrived_time,
  );
}

export default function ShipmentTracksTable({
  actionRef,
  onRequireRishenghuiToken,
  rishenghuiAccessToken,
  shipmentOptions,
}: ShipmentTracksTableProps) {
  const searchParamsRef = useRef<Record<string, unknown>>({});
  const [dataSource, setDataSource] = useState<ShipmentTrackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Key[]>([]);
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
  }, [messageApi, onRequireRishenghuiToken, requestTrackUpdate]);

  const handleUpdateTrack = useCallback(async (
    record: ShipmentTrackRecord,
    accessTokenOverride?: string,
  ) => {
    if (!canUpdateShipmentTrack(record)) {
      messageApi.warning(
        record.warehouse_arrived_time
          ? "已到仓货件禁止更新轨迹"
          : "当前物流商不支持更新轨迹",
      );
      return;
    }

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
    messageApi,
    onRequireRishenghuiToken,
    rishenghuiAccessToken,
    runUpdateTrack,
  ]);

  const selectedTrackRecords = useMemo(() => {
    const selectedIdSet = new Set(selectedTrackIds);
    return dataSource.filter((item) => selectedIdSet.has(item.id));
  }, [dataSource, selectedTrackIds]);

  const handleBatchUpdateTracks = useCallback(async (
    records: ShipmentTrackRecord[],
    token: string,
  ) => {
    const updatableRecords = records.filter(canUpdateShipmentTrack);

    setBatchUpdating(true);
    setUpdatingTrackIds((current) =>
      Array.from(new Set([...current, ...updatableRecords.map((item) => item.id)])),
    );

    const failures: Array<{ shipmentNo: string; error: string }> = [];
    let successCount = 0;

    try {
      for (const record of updatableRecords) {
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
          (id) => !updatableRecords.some((record) => record.id === id),
        ),
      );
      setBatchUpdating(false);
      setSelectedTrackIds([]);
    }

    if (successCount > 0) {
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
  ]);

  const handleBatchUpdateTracksClick = useCallback(() => {
    const updatableRecords = selectedTrackRecords.filter(canUpdateShipmentTrack);

    if (!selectedTrackRecords.length) {
      messageApi.warning("请先选择需要更新轨迹的货件");
      return;
    }

    if (!updatableRecords.length) {
      messageApi.warning("已选择货件均已到仓或物流商不支持更新轨迹");
      return;
    }

    const hasRishenghui = updatableRecords.some(
      (item) => item.logistics_provider?.trim() === "日升辉",
    );
    const token = rishenghuiAccessToken.trim();

    if (hasRishenghui && !token) {
      onRequireRishenghuiToken(undefined, (accessToken) =>
        handleBatchUpdateTracks(updatableRecords, accessToken),
      );
      return;
    }

    void handleBatchUpdateTracks(updatableRecords, token);
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
    (record: ShipmentTrackRecord, field: ShipmentTrackDateField) =>
      `${record.id}:${field}`,
    [],
  );

  const handleStartTrackDateEdit = useCallback((
    record: ShipmentTrackRecord,
    field: ShipmentTrackDateField,
  ) => {
    setEditingTrackDateKey(getTrackDateKey(record, field));
  }, [getTrackDateKey]);

  const handleCancelTrackDateEdit = useCallback((
    record: ShipmentTrackRecord,
    field: ShipmentTrackDateField,
  ) => {
    const editKey = getTrackDateKey(record, field);
    setEditingTrackDateKey((current) =>
      current === editKey ? null : current,
    );
  }, [getTrackDateKey]);

  const handleChangeTrackDate = useCallback(async (
    record: ShipmentTrackRecord,
    field: ShipmentTrackDateField,
    value: Dayjs | null,
  ) => {
    const nextValue = value ? value.format("YYYY-MM-DD") : null;
    const currentValue = formatShipmentTrackDate(record[field]) || null;
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
      messageApi.success("轨迹时间更新成功");
    } catch (error) {
      messageApi.error(
        error instanceof Error ? error.message : "轨迹时间更新失败",
      );
    } finally {
      setUpdatingTrackDateKeys((current) =>
        current.filter((key) => key !== updateKey),
      );
      setEditingTrackDateKey((current) =>
        current === updateKey ? null : current,
      );
    }
  }, [getTrackDateKey, messageApi]);

  const isTrackDateEditing = useCallback(
    (record: ShipmentTrackRecord, field: ShipmentTrackDateField) =>
      editingTrackDateKey === getTrackDateKey(record, field),
    [editingTrackDateKey, getTrackDateKey],
  );

  const isTrackDateUpdating = useCallback(
    (record: ShipmentTrackRecord, field: ShipmentTrackDateField) =>
      updatingTrackDateKeys.includes(getTrackDateKey(record, field)),
    [getTrackDateKey, updatingTrackDateKeys],
  );

  const productSelectOptions = useMemo(
    () => buildSelectOptions(shipmentOptions.map((item) => item.product_name)),
    [shipmentOptions],
  );
  const logisticsProviderOptions = useMemo(
    () =>
      buildSelectOptions(
        shipmentOptions.map((item) => item.logistics_provider),
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
        canUpdateShipmentTrack,
        isTrackDateUpdating,
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
      productSelectOptions,
      logisticsProviderOptions,
    ],
  );

  const loadRecords = useCallback(
    async (params: Record<string, unknown>) => {
      setLoading(true);

      try {
        const result = await requestShipmentTrackRecords(params);
        const nextData = result.data ?? [];

        setDataSource(nextData);
        setSelectedTrackIds([]);
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
    <>
      <ProTable<ShipmentTrackRecord>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={dataSource}
        loading={loading}
        rowSelection={{
          selectedRowKeys: selectedTrackIds,
          preserveSelectedRowKeys: true,
          onChange: (keys) => setSelectedTrackIds(keys),
          getCheckboxProps: (record) => ({
            disabled:
              batchUpdating ||
              isUpdatingTrack(record) ||
              !canUpdateShipmentTrack(record),
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
          reload: false,
          setting: true,
        }}
        toolBarRender={() => [
          <Space key="batch-track-actions">
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
          x: 1360,
          y: searchCollapsed
            ? SHIPMENT_TRACKS_TABLE_SCROLL_Y_COLLAPSED
            : SHIPMENT_TRACKS_TABLE_SCROLL_Y_EXPANDED,
        }}
        pagination={false}
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
