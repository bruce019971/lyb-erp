"use client";

import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Button, Spin, Table, Tooltip, Typography } from "antd";
import type { SortOrder, SorterResult } from "antd/es/table/interface";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DamageRecord } from "../_lib/damages";
import {
  requestDamageRecords,
  requestDamageTotalValue,
} from "../_lib/damages-request";
import { getDamageColumns } from "./damages-columns";

type DamagesTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  onCreate: () => void;
};

const PAGE_SIZE = 40;
const DAMAGE_SUMMARY_COLUMN_KEYS = [
  "delivery_shipment_no",
  "product_name",
  "delivery_store",
  "delivery_date",
  "product_count",
  "damage_count",
  "product_value",
  "freight_value",
  "total_value",
] as const;

function mergeDamageRecords(
  current: DamageRecord[],
  incoming: DamageRecord[],
) {
  const merged = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values());
}

function normalizeSorter(
  sorter: SorterResult<DamageRecord> | SorterResult<DamageRecord>[],
) {
  const activeSorter = Array.isArray(sorter)
    ? sorter.find((item) => item.order)
    : sorter;
  const field = activeSorter?.field;

  if (
    !activeSorter?.order ||
    (typeof field !== "string" && typeof field !== "number")
  ) {
    return {};
  }

  return { [String(field)]: activeSorter.order } as Record<string, SortOrder>;
}

function formatSummaryMoney(value: number) {
  return `¥${value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function DamagesTable({
  actionRef,
  onCreate,
}: DamagesTableProps) {
  const columns = useMemo(() => getDamageColumns(), []);
  const searchParamsRef = useRef<Record<string, unknown>>({});
  const sorterRef = useRef<Record<string, SortOrder>>({});
  const loadingRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const currentPageRef = useRef(1);
  const requestVersionRef = useRef(0);
  const [dataSource, setDataSource] = useState<DamageRecord[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadPage = useCallback(
    async (
      page: number,
      params: Record<string, unknown>,
      sorter: Record<string, SortOrder>,
      options: { append: boolean; requestVersion: number },
    ) => {
      const { append, requestVersion } = options;

      if (append) {
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        loadingRef.current = true;
        hasMoreRef.current = false;
        setLoading(true);
      }

      try {
        const [result, nextTotalValue] = await Promise.all([
          requestDamageRecords(
            { ...params, current: page, pageSize: PAGE_SIZE },
            sorter,
          ),
          append ? Promise.resolve(null) : requestDamageTotalValue(params),
        ]);

        if (requestVersion !== requestVersionRef.current) return;

        const nextData = result.data ?? [];
        setDataSource((current) =>
          append ? mergeDamageRecords(current, nextData) : nextData,
        );
        if (nextTotalValue !== null) setTotalValue(nextTotalValue);

        currentPageRef.current = page;
        hasMoreRef.current = page * PAGE_SIZE < result.total;
      } catch {
        if (requestVersion !== requestVersionRef.current) return;

        if (!append) {
          setDataSource([]);
          setTotalValue(0);
          hasMoreRef.current = false;
        }
      } finally {
        if (requestVersion === requestVersionRef.current) {
          loadingRef.current = false;
          loadingMoreRef.current = false;
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  const reloadFirstPage = useCallback(async () => {
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;

    await loadPage(1, searchParamsRef.current, sorterRef.current, {
      append: false,
      requestVersion,
    });
  }, [loadPage]);

  const loadNextPage = useCallback(async () => {
    if (loadingRef.current || loadingMoreRef.current || !hasMoreRef.current) {
      return;
    }

    await loadPage(
      currentPageRef.current + 1,
      searchParamsRef.current,
      sorterRef.current,
      { append: true, requestVersion: requestVersionRef.current },
    );
  }, [loadPage]);

  useEffect(() => {
    let cancelled = false;

    window.queueMicrotask(() => {
      if (!cancelled) void reloadFirstPage();
    });

    return () => {
      cancelled = true;
      requestVersionRef.current += 1;
    };
  }, [reloadFirstPage]);

  useEffect(() => {
    if (!actionRef) return;

    actionRef.current = {
      reload: () => {
        void reloadFirstPage();
      },
      reloadAndRest: () => {
        searchParamsRef.current = {};
        sorterRef.current = {};
        void reloadFirstPage();
      },
    } as ActionType;

    return () => {
      actionRef.current = undefined;
    };
  }, [actionRef, reloadFirstPage]);

  return (
    <ProTable<DamageRecord>
      className="damages-table-with-sticky-summary"
      rowKey="id"
      size="small"
      columns={columns}
      dataSource={dataSource}
      loading={loading}
      search={{ labelWidth: "auto", defaultCollapsed: false }}
      options={{
        density: false,
        fullScreen: false,
        reload: false,
        setting: true,
      }}
      toolBarRender={() => [
        <Tooltip key="create" title="新增货损">
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
      scroll={{ x: 970, y: "calc(100vh - 360px)" }}
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
        void reloadFirstPage();
      }}
      onReset={() => {
        searchParamsRef.current = {};
        void reloadFirstPage();
      }}
      onChange={(_, __, sorter, extra) => {
        if (extra.action !== "sort") return;
        sorterRef.current = normalizeSorter(sorter);
        void reloadFirstPage();
      }}
      pagination={false}
      dateFormatter="string"
      summary={() => (
        <Table.Summary fixed="bottom">
          <Table.Summary.Row className="damage-summary-row">
            {DAMAGE_SUMMARY_COLUMN_KEYS.map((key, index) => {
              let content = null;

              if (key === "delivery_shipment_no") {
                content = "合计";
              }

              if (key === "total_value") {
                content = (
                  <Typography.Text strong>
                    {formatSummaryMoney(totalValue)}
                  </Typography.Text>
                );
              }

              return (
                <Table.Summary.Cell
                  key={key}
                  index={index}
                  align={key === "total_value" ? "right" : undefined}
                >
                  {content}
                </Table.Summary.Cell>
              );
            })}
          </Table.Summary.Row>
        </Table.Summary>
      )}
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
