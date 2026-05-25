"use client";

import { FileSyncOutlined, PlusOutlined } from "@ant-design/icons";
import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import type { FormInstance } from "antd";
import { App, Button, Spin, Tooltip } from "antd";
import type { Key } from "react";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  batchGenerateShipmentCartonLabels,
  requestShipmentRecords,
} from "../_lib/shipments-request";
import { getShipmentColumns } from "./shipments-columns";
import type { ShipmentOption, ShipmentRecord } from "../_lib/shipments";
import type { ProductShipmentOption } from "../../products/_lib/products";
import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import type { StoreOption } from "../../stores/_lib/stores";
import {
  downloadShipmentCartonLabel,
  downloadShipmentLogisticsBoxMark,
} from "../_lib/carton-label";
import {
  getShipmentListStatusRank,
  isShipmentDeliveryOverdue,
  isShipmentLocked,
  isShipmentWarehousePendingDelivery,
} from "../_lib/shipments";

type ShipmentsTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  formRef?: MutableRefObject<FormInstance | undefined>;
  onCreate: () => void;
  onBatchCartonLabels: () => void;
  onSelectedShipmentNosChange: (shipmentNos: string[]) => void;
  onGenerateLogisticsBoxMark: (record: ShipmentRecord) => void;
  onRishenghuiOrder: (record: ShipmentRecord) => void;
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
  isGeneratingCartonLabel: (record: ShipmentRecord) => boolean;
  isGeneratingLogisticsBoxMark: (record: ShipmentRecord) => boolean;
  onStartGenerateCartonLabel: (record: ShipmentRecord) => void;
  onFinishGenerateCartonLabel: () => void;
  shipmentOptions: ShipmentOption[];
  storeOptions: StoreOption[];
  productOptions: ProductShipmentOption[];
  logisticsOptions: LogisticsProviderOption[];
};

const STORAGE_PREFIX = "mercado-inbound-planning:shipments";
const COLUMNS_STATE_STORAGE_KEY = `${STORAGE_PREFIX}:columns:v3`;
const PAGE_SIZE = 40;

function mergeShipmentsById(
  current: ShipmentRecord[],
  incoming: ShipmentRecord[],
) {
  const merged = new Map<string, ShipmentRecord>();

  current.forEach((item) => {
    merged.set(item.id, item);
  });

  incoming.forEach((item) => {
    merged.set(item.id, item);
  });

  return Array.from(merged.values());
}

function isWarehouseArrivedUndelivered(record: ShipmentRecord) {
  return isShipmentWarehousePendingDelivery(record);
}

function prioritizeShipmentAlerts(records: ShipmentRecord[]) {
  return records
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const statusRankDiff =
        getShipmentListStatusRank(left.record) -
        getShipmentListStatusRank(right.record);
      if (statusRankDiff !== 0) {
        return statusRankDiff;
      }

      const leftRank =
        getShipmentListStatusRank(left.record) === 0 &&
        isShipmentDeliveryOverdue(left.record)
          ? 0
          : 1;
      const rightRank =
        getShipmentListStatusRank(right.record) === 0 &&
        isShipmentDeliveryOverdue(right.record)
          ? 0
          : 1;

      return leftRank - rightRank || left.index - right.index;
    })
    .map(({ record }) => record);
}

export default function ShipmentsTable({
  actionRef,
  formRef,
  onCreate,
  onBatchCartonLabels,
  onSelectedShipmentNosChange,
  onGenerateLogisticsBoxMark,
  onRishenghuiOrder,
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
  isGeneratingCartonLabel,
  isGeneratingLogisticsBoxMark,
  onStartGenerateCartonLabel,
  onFinishGenerateCartonLabel,
  shipmentOptions,
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
  const loadingRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const currentPageRef = useRef(1);
  const [dataSource, setDataSource] = useState<ShipmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [reloadRequest, setReloadRequest] = useState(0);

  const loadPage = useCallback(
    async (
      page: number,
      params: Record<string, unknown>,
      options?: { append?: boolean },
    ) => {
      const append = options?.append ?? false;

      if (append) {
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        loadingRef.current = true;
        setLoading(true);
      }

      try {
        const result = await requestShipmentRecords(
          {
            ...params,
            current: page,
            pageSize: PAGE_SIZE,
          },
          {},
          {},
        );

        const nextData = prioritizeShipmentAlerts(result.data ?? []);
        setDataSource((current) =>
          append
            ? prioritizeShipmentAlerts(mergeShipmentsById(current, nextData))
            : nextData,
        );
        if (!append) {
          setSelectedRowKeys([]);
          onSelectedShipmentNosChange([]);
        }
        currentPageRef.current = page;
        hasMoreRef.current = nextData.length >= PAGE_SIZE;
      } finally {
        loadingRef.current = false;
        loadingMoreRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [onSelectedShipmentNosChange],
  );

  const reloadFirstPage = useCallback(async () => {
    await loadPage(1, searchParamsRef.current, { append: false });
  }, [loadPage]);

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
        onRishenghuiOrder,
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
        shipmentOptions,
        storeOptions,
        productOptions,
        logisticsOptions,
      ),
    [
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
      onCancelDeliveryStatusEdit,
      onCancelRelabelEdit,
      onChangeDeliveryStatus,
      onChangeRelabel,
      onDelete,
      onEdit,
      onGenerateLogisticsBoxMark,
      onRishenghuiOrder,
      onStartDeliveryStatusEdit,
      onStartRelabelEdit,
      productOptions,
      shipmentOptions,
      storeOptions,
    ],
  );

  const loadNextPage = useCallback(async () => {
    if (
      loadingRef.current ||
      loadingMoreRef.current ||
      !hasMoreRef.current
    ) {
      return;
    }

    await loadPage(currentPageRef.current + 1, searchParamsRef.current, {
      append: true,
    });
  }, [loadPage]);

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
        void loadPage(1, {}, { append: false });
      },
    } as ActionType;

    return () => {
      actionRef.current = undefined;
    };
  }, [actionRef, loadPage, reloadFirstPage]);

  return (
    <ProTable<ShipmentRecord>
      formRef={formRef}
      rowKey="id"
      size="small"
      columns={columns}
      dataSource={dataSource}
      loading={loading}
      rowSelection={{
        type: "checkbox",
        selectedRowKeys,
        preserveSelectedRowKeys: true,
        getCheckboxProps: (record) => ({
          disabled: isShipmentLocked(record),
        }),
        onChange: (keys, rows) => {
          setSelectedRowKeys(keys);
          onSelectedShipmentNosChange(
            rows
              .filter((item) => !isShipmentLocked(item))
              .map((item) => item.shipment_no?.trim())
              .filter((item): item is string => Boolean(item)),
          );
        },
      }}
      rowClassName={(record) => {
        if (record.is_delivery_completed) return "shipment-delivered-row";
        if (isWarehouseArrivedUndelivered(record)) {
          return "shipment-warehouse-pending-delivery-row";
        }
        if (isShipmentDeliveryOverdue(record)) {
          return "shipment-delivery-overdue-row";
        }
        return "";
      }}
      tableAlertRender={false}
      tableAlertOptionRender={false}
      columnsState={{
        persistenceKey: COLUMNS_STATE_STORAGE_KEY,
        persistenceType: "localStorage",
      }}
      scroll={{ x: 1800, y: "calc(100vh - 360px)" }}
      onScroll={(event) => {
        const target = event.currentTarget;
        if (
          target.scrollTop + target.clientHeight >=
          target.scrollHeight - 80
        ) {
          void loadNextPage();
        }
      }}
      search={{
        labelWidth: "auto",
        defaultCollapsed: false,
      }}
      onSubmit={(values) => {
        searchParamsRef.current = values;
        void loadPage(1, values, { append: false });
      }}
      onReset={() => {
        searchParamsRef.current = {};
        void loadPage(1, {}, { append: false });
      }}
      options={{
        density: false,
        fullScreen: false,
        reload: false,
        setting: true,
      }}
      toolBarRender={() => {
        const actions = [
          <Tooltip key="create" title="新增货件">
            <Button type="text" icon={<PlusOutlined />} onClick={onCreate} />
          </Tooltip>,
          <Tooltip key="batch-carton-labels" title="批量生成外箱标签">
            <Button
              type="text"
              icon={<FileSyncOutlined />}
              onClick={onBatchCartonLabels}
            />
          </Tooltip>,
        ];

        return actions;
      }}
      pagination={false}
      dateFormatter="string"
      tableRender={(_, dom) => (
        <div className="relative">
          {dom}
          {loadingMore ? (
            <div className="flex justify-center py-3 text-slate-400">
              <Spin size="small" />
            </div>
          ) : null}
        </div>
      )}
    />
  );
}
