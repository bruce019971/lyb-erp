"use client";

import { PlusOutlined } from "@ant-design/icons";
import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Button, Spin, Tooltip } from "antd";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { requestShipmentRecords } from "../_lib/shipments-request";
import { getShipmentColumns } from "./shipments-columns";
import type { ShipmentRecord } from "../_lib/shipments";
import type { ProductShipmentOption } from "../../products/_lib/products";
import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import type { StoreOption } from "../../stores/_lib/stores";

type ShipmentsTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  onCreate: () => void;
  onEdit: (record: ShipmentRecord) => void;
  storeOptions: StoreOption[];
  productOptions: ProductShipmentOption[];
  logisticsOptions: LogisticsProviderOption[];
};

const STORAGE_PREFIX = "mercado-inbound-planning:shipments";
const COLUMNS_STATE_STORAGE_KEY = `${STORAGE_PREFIX}:columns:v1`;
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

export default function ShipmentsTable({
  actionRef,
  onCreate,
  onEdit,
  storeOptions,
  productOptions,
  logisticsOptions,
}: ShipmentsTableProps) {
  const columns = useMemo(
    () =>
      getShipmentColumns(onEdit, storeOptions, productOptions, logisticsOptions),
    [logisticsOptions, onEdit, productOptions, storeOptions],
  );
  const searchParamsRef = useRef<Record<string, unknown>>({});
  const loadingRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const currentPageRef = useRef(1);
  const [dataSource, setDataSource] = useState<ShipmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

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

        const nextData = result.data ?? [];
        setDataSource((current) =>
          append ? mergeShipmentsById(current, nextData) : nextData,
        );
        currentPageRef.current = page;
        setCurrentPage(page);
        hasMoreRef.current = nextData.length >= PAGE_SIZE;
        setHasMore(nextData.length >= PAGE_SIZE);
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
      rowKey="id"
      size="small"
      columns={columns}
      dataSource={dataSource}
      loading={loading}
      columnsState={{
        persistenceKey: COLUMNS_STATE_STORAGE_KEY,
        persistenceType: "localStorage",
      }}
      scroll={{ x: 1700, y: "calc(100vh - 360px)" }}
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
      toolBarRender={() => [
        <Tooltip key="create" title="新增货件">
          <Button type="text" icon={<PlusOutlined />} onClick={onCreate} />
        </Tooltip>,
      ]}
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
