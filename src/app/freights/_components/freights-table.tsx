"use client";

import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Spin } from "antd";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import type { ShipmentOption } from "../../shipments/_lib/shipments";
import type { FreightRecord } from "../_lib/freights";
import { requestFreightRecords } from "../_lib/freights-request";
import { getFreightColumns } from "./freights-columns";

type FreightsTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  shipmentOptions: ShipmentOption[];
  logisticsOptions: LogisticsProviderOption[];
  onEdit: (record: FreightRecord) => void;
};

const PAGE_SIZE = 40;

function mergeFreightsById(current: FreightRecord[], incoming: FreightRecord[]) {
  const merged = new Map<string, FreightRecord>();

  current.forEach((item) => {
    merged.set(item.id, item);
  });

  incoming.forEach((item) => {
    merged.set(item.id, item);
  });

  return Array.from(merged.values());
}

export default function FreightsTable({
  actionRef,
  shipmentOptions,
  logisticsOptions,
  onEdit,
}: FreightsTableProps) {
  const columns = useMemo(
    () => getFreightColumns(onEdit, shipmentOptions, logisticsOptions),
    [logisticsOptions, onEdit, shipmentOptions],
  );
  const searchParamsRef = useRef<Record<string, unknown>>({});
  const loadingRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const currentPageRef = useRef(1);
  const [dataSource, setDataSource] = useState<FreightRecord[]>([]);
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
        const result = await requestFreightRecords({
          ...params,
          current: page,
          pageSize: PAGE_SIZE,
        });

        const nextData = result.data ?? [];
        setDataSource((current) =>
          append ? mergeFreightsById(current, nextData) : nextData,
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
    <ProTable<FreightRecord>
      rowKey="id"
      size="small"
      columns={columns}
      dataSource={dataSource}
      loading={loading}
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
      scroll={{ x: 1220, y: "calc(100vh - 360px)" }}
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
        searchParamsRef.current = {};
        void loadPage(1, {}, { append: false });
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
