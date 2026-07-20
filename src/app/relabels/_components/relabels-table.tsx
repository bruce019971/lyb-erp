"use client";

import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Button, Spin, Tooltip } from "antd";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import { requestRelabelRecords } from "../_lib/relabels-request";
import {
  isRelabelDeliveryOverdue,
  type RelabelRecord,
} from "../_lib/relabels";

import { getRelabelColumns } from "./relabels-columns";

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
    const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;

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
  const columns = useMemo(
    () =>
      getRelabelColumns(
        onEdit,
        onDelete,
        onStartDeliveryStatusEdit,
        onCancelDeliveryStatusEdit,
        onChangeDeliveryStatus,
        isDeliveryStatusEditing,
        isStatusUpdating,
        isDeleting,
        logisticsOptions,
      ),
    [
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
        const result = await requestRelabelRecords({
          ...params,
          current: page,
          pageSize: PAGE_SIZE,
        });
        const nextData = result.data ?? [];

        setDataSource((current) =>
          sortRelabelRows(
            append ? mergeRelabelsById(current, nextData) : nextData,
          ),
        );
        currentPageRef.current = page;
        hasMoreRef.current = nextData.length >= PAGE_SIZE;
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

  const loadNextPage = useCallback(async () => {
    if (loadingRef.current || loadingMoreRef.current || !hasMoreRef.current) {
      return;
    }

    await loadPage(currentPageRef.current + 1, searchParamsRef.current, {
      append: true,
    });
  }, [loadPage]);

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
      loading={loading}
      rowClassName={(record) => {
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
        <Tooltip key="create" title="新增换标记录">
          <Button type="text" icon={<PlusOutlined />} onClick={onCreate} />
        </Tooltip>,
        <Tooltip key="reload" title="刷新列表">
          <Button
            type="text"
            icon={<ReloadOutlined />}
            onClick={() => actionRef?.current?.reload()}
          />
        </Tooltip>,
      ]}
      scroll={{ x: 1070, y: "calc(100vh - 360px)" }}
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
