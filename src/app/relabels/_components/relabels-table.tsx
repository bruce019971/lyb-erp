"use client";

import { CheckCircleOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { App, Button, Spin, Tooltip } from "antd";
import type { Key, MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import {
  batchMarkRelabelsDelivered,
  requestRelabelRecords,
} from "../_lib/relabels-request";
import {
  hasRelabelDeliveryDateArrived,
  isRelabelDeliveryOverdue,
  type RelabelRecord,
} from "../_lib/relabels";

import { getRelabelColumns } from "./relabels-columns";
import {
  getPendingRelabelDownloadIds,
  isRelabelDownloadStorageKey,
  RELABEL_DOWNLOAD_CHANGED,
} from "../_lib/relabel-download-state";

type RelabelsTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  originalShipmentNo?: string;
  onCreate: () => void;
  onEdit: (record: RelabelRecord) => void;
  onDelete: (record: RelabelRecord) => void;
  onStartDeliveryStatusEdit: (record: RelabelRecord) => void;
  onCancelDeliveryStatusEdit: () => void;
  onChangeDeliveryStatus: (record: RelabelRecord, value: string) => void;
  isDeliveryStatusEditing: (record: RelabelRecord) => boolean;
  isStatusUpdating: (
    record: RelabelRecord,
    field: "delivery_status",
  ) => boolean;
  isDeleting: (record: RelabelRecord) => boolean;
  logisticsOptions: LogisticsProviderOption[];
};

const PAGE_SIZE = 40;

function mergeRelabelsById(
  current: RelabelRecord[],
  incoming: RelabelRecord[],
) {
  const merged = new Map<string, RelabelRecord>();

  current.forEach((item) => {
    merged.set(item.id, item);
  });

  incoming.forEach((item) => {
    merged.set(item.id, item);
  });

  return Array.from(merged.values());
}

function sortRelabelRows(records: RelabelRecord[]) {
  return [...records].sort((left, right) => {
    const pendingOrder = Number(Boolean(right.pending_instruction_download)) -
      Number(Boolean(left.pending_instruction_download));
    if (pendingOrder) return pendingOrder;
    if (left.pending_instruction_download && right.pending_instruction_download) {
      const leftCreated = left.created_at ? new Date(left.created_at).getTime() : 0;
      const rightCreated = right.created_at ? new Date(right.created_at).getTime() : 0;
      return rightCreated - leftCreated || right.id.localeCompare(left.id);
    }
    const leftTime = left.delivery_time
      ? new Date(left.delivery_time).getTime()
      : Number.NEGATIVE_INFINITY;
    const rightTime = right.delivery_time
      ? new Date(right.delivery_time).getTime()
      : Number.NEGATIVE_INFINITY;

    return rightTime - leftTime || right.id.localeCompare(left.id);
  });
}

export default function RelabelsTable({
  actionRef,
  originalShipmentNo,
  onCreate,
  onEdit,
  onDelete,
  onStartDeliveryStatusEdit,
  onCancelDeliveryStatusEdit,
  onChangeDeliveryStatus,
  isDeliveryStatusEditing,
  isStatusUpdating,
  isDeleting,
  logisticsOptions,
}: RelabelsTableProps) {
  const { message } = App.useApp();
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [batchDelivering, setBatchDelivering] = useState(false);
  const batchDeliveringRef = useRef(false);
  const columns = useMemo(
    () =>
      getRelabelColumns(
        onEdit,
        onDelete,
        onStartDeliveryStatusEdit,
        onCancelDeliveryStatusEdit,
        onChangeDeliveryStatus,
        isDeliveryStatusEditing,
        (record, field) => batchDelivering || isStatusUpdating(record, field),
        isDeleting,
        logisticsOptions,
      ),
    [
      batchDelivering,
      isDeleting,
      isDeliveryStatusEditing,
      isStatusUpdating,
      logisticsOptions,
      onCancelDeliveryStatusEdit,
      onChangeDeliveryStatus,
      onDelete,
      onEdit,
      onStartDeliveryStatusEdit,
    ],
  );
  const initialSearchParams = useMemo(
    () =>
      originalShipmentNo
        ? { original_shipment_no: [originalShipmentNo] }
        : {},
    [originalShipmentNo],
  );
  const searchParamsRef = useRef<Record<string, unknown>>(initialSearchParams);
  const loadingRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const currentPageRef = useRef(1);
  const [dataSource, setDataSource] = useState<RelabelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const selectedDeliverableRecords = dataSource.filter(
    (record) =>
      selectedRowKeys.includes(record.id) && hasRelabelDeliveryDateArrived(record),
  );

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
        setSelectedRowKeys([]);
      }

      try {
        const result = await requestRelabelRecords({
          ...params,
          current: page,
          pageSize: PAGE_SIZE,
        });
        const pendingIds = new Set(getPendingRelabelDownloadIds());
        const nextData = (result.data ?? []).map((record) => ({
          ...record,
          pending_instruction_download: pendingIds.has(record.id),
        }));

        setDataSource((current) =>
          sortRelabelRows(
            append ? mergeRelabelsById(current, nextData) : nextData,
          ),
        );
        currentPageRef.current = page;
        hasMoreRef.current = page * PAGE_SIZE < result.total;
      } finally {
        loadingRef.current = false;
        loadingMoreRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  const reloadFirstPage = useCallback(async () => {
    await loadPage(1, searchParamsRef.current, { append: false });
  }, [loadPage]);

  useEffect(() => {
    const reload = () => {
      const pendingIds = new Set(getPendingRelabelDownloadIds());
      setDataSource((current) => sortRelabelRows(current.map((record) => ({
        ...record,
        pending_instruction_download: pendingIds.has(record.id),
      }))));
      void reloadFirstPage();
    };
    const onStorage = (event: StorageEvent) => {
      if (isRelabelDownloadStorageKey(event.key)) reload();
    };
    window.addEventListener(RELABEL_DOWNLOAD_CHANGED, reload);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(RELABEL_DOWNLOAD_CHANGED, reload);
      window.removeEventListener("storage", onStorage);
    };
  }, [reloadFirstPage]);

  const loadNextPage = useCallback(async () => {
    if (
      loadingRef.current ||
      loadingMoreRef.current ||
      batchDeliveringRef.current ||
      !hasMoreRef.current
    ) {
      return;
    }

    await loadPage(currentPageRef.current + 1, searchParamsRef.current, {
      append: true,
    });
  }, [loadPage]);

  async function handleBatchDelivered() {
    if (
      batchDeliveringRef.current ||
      loadingRef.current ||
      loadingMoreRef.current
    ) return;

    const selectedIds = new Set(selectedRowKeys.map(String));
    const ids = dataSource
      .filter(
        (record) => selectedIds.has(record.id) && hasRelabelDeliveryDateArrived(record),
      )
      .map((record) => record.id);
    if (ids.length === 0) return;

    batchDeliveringRef.current = true;
    setBatchDelivering(true);
    onCancelDeliveryStatusEdit();

    try {
      const { succeededIds, failures } = await batchMarkRelabelsDelivered(ids);
      const succeeded = new Set(succeededIds);
      setDataSource((current) =>
        current.map((record) =>
          succeeded.has(record.id) ? { ...record, delivery_status: "是" } : record,
        ),
      );
      setSelectedRowKeys(failures.map((item) => item.id));

      if (failures.length > 0) {
        message.error(
          `已完成 ${succeededIds.length} 条，失败 ${failures.length} 条：${failures[0].message}。失败记录仍保留勾选，可重试。`,
          8,
        );
      } else {
        message.success(`已将 ${succeededIds.length} 条换标记录设置为已送仓，并同步原货件状态`);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "批量设置已送仓失败，请重试");
    } finally {
      batchDeliveringRef.current = false;
      setBatchDelivering(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    searchParamsRef.current = initialSearchParams;

    window.queueMicrotask(() => {
      if (!cancelled) {
        void loadPage(1, initialSearchParams, { append: false });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [initialSearchParams, loadPage]);

  useEffect(() => {
    if (!actionRef) return;

    actionRef.current = {
      reload: () => {
        void reloadFirstPage();
      },
      reloadAndRest: () => {
        searchParamsRef.current = initialSearchParams;
        void loadPage(1, initialSearchParams, { append: false });
      },
    } as ActionType;

    return () => {
      actionRef.current = undefined;
    };
  }, [actionRef, initialSearchParams, loadPage, reloadFirstPage]);

  return (
    <ProTable<RelabelRecord>
      rowKey="id"
      size="small"
      columns={columns}
      dataSource={dataSource}
      loading={loading || batchDelivering}
      rowSelection={{
        type: "checkbox",
        selectedRowKeys,
        preserveSelectedRowKeys: true,
        onChange: setSelectedRowKeys,
        getCheckboxProps: (record) => ({
          disabled:
            batchDelivering || loading || !hasRelabelDeliveryDateArrived(record),
          title: !record.delivery_time
            ? "请先设置送仓时间"
            : !hasRelabelDeliveryDateArrived(record)
              ? "未到送仓日期，不能设置已送仓"
              : "选择该换标记录",
        }),
      }}
      tableAlertOptionRender={false}
      rowClassName={(record) => {
        if (record.pending_instruction_download) return "relabel-pending-download-row";
        if (record.delivery_status === "是") return "relabel-delivered-row";
        return isRelabelDeliveryOverdue(record) ? "relabel-alert-row" : "";
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
      toolBarRender={() => [
        <Button
          key="batch-delivered"
          type="primary"
          icon={<CheckCircleOutlined />}
          disabled={selectedDeliverableRecords.length === 0 || loading || loadingMore}
          loading={batchDelivering}
          onClick={() => void handleBatchDelivered()}
        >
          批量设置已送仓
        </Button>,
        <Tooltip key="create" title="新增换标记录">
          <Button type="text" icon={<PlusOutlined />} disabled={batchDelivering} onClick={onCreate} />
        </Tooltip>,
        <Tooltip key="reload" title="刷新列表">
          <Button
            type="text"
            icon={<ReloadOutlined />}
            disabled={batchDelivering}
            onClick={() => actionRef?.current?.reload()}
          />
        </Tooltip>,
      ]}
      scroll={{ x: 1690, y: "calc(100vh - 360px)" }}
      onScroll={(event) => {
        const target = event.currentTarget;

        if (
          target.scrollTop + target.clientHeight >=
          target.scrollHeight - 80
        ) {
          void loadNextPage();
        }
      }}
      onSubmit={(values) => {
        searchParamsRef.current = values;
        void loadPage(1, values, { append: false });
      }}
      onReset={() => {
        searchParamsRef.current = initialSearchParams;
        void loadPage(1, initialSearchParams, { append: false });
      }}
      pagination={false}
      dateFormatter="string"
      form={{
        initialValues: initialSearchParams,
        disabled: batchDelivering,
      }}
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
