"use client";

import { App } from "antd";
import type { TableProps } from "antd";
import type { FilterValue, SortOrder } from "antd/es/table/interface";
import { useCallback, useEffect, useRef, useState, type Key } from "react";

type Params = Record<string, unknown>;
type Sorter = Record<string, SortOrder>;
type Filters = Record<string, FilterValue | null>;
type LoadOptions = { current?: number; pageSize?: number; refreshSummary?: boolean; clearSelection?: boolean };

// Lists and totals have separate generations: changing pages must not discard
// an in-flight total, while changing filters must discard both stale results.
export function useServerTable<Row extends { id: string }, Summary>({
  request,
  requestSummary,
  buildParams,
}: {
  request: (params: Params, sorter: Sorter, filters: Filters) => Promise<{ data: Row[]; success: boolean; total: number }>;
  requestSummary: (params: Params, filters: Filters) => Promise<Summary>;
  buildParams: (params: Params) => Params;
}) {
  const { message } = App.useApp();
  const [dataSource, setDataSource] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 });
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Map<string, Row>());
  const state = useRef({ current: 1, pageSize: 50, params: {} as Params, sorter: {} as Sorter, filters: {} as Filters });
  const listGeneration = useRef(0);
  const summaryGeneration = useRef(0);

  useEffect(() => () => {
    listGeneration.current += 1;
    summaryGeneration.current += 1;
  }, []);

  const loadRecords = useCallback(async (params: Params, options: LoadOptions = {}) => {
    const generation = ++listGeneration.current;
    const { refreshSummary = true, clearSelection = true } = options;
    const current = options.current ?? 1;
    const pageSize = options.pageSize ?? state.current.pageSize;
    state.current = { ...state.current, current, pageSize, params };
    const { sorter, filters } = state.current;
    const requestParams = buildParams(params);
    setPagination((previous) => ({ ...previous, current, pageSize }));
    setLoading(true);
    if (clearSelection) {
      setSelectedRowKeys([]);
      setSelectedRows(new Map());
    }

    if (refreshSummary) {
      const summaryId = ++summaryGeneration.current;
      setSummary(null);
      setSummaryLoading(true);
      void requestSummary(requestParams, filters).then((result) => {
        if (summaryId === summaryGeneration.current) setSummary(result);
      }).catch(() => {
        if (summaryId === summaryGeneration.current) void message.error("合计加载失败，请刷新重试");
      }).finally(() => {
        if (summaryId === summaryGeneration.current) setSummaryLoading(false);
      });
    }

    try {
      let result = await request({ ...requestParams, current, pageSize }, sorter, filters);
      if (generation !== listGeneration.current) return;
      if (!result.success) throw new Error("列表加载失败，请刷新重试");
      // Deleting the last row of the last page must not leave an empty page.
      const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
      const resolvedPage = Math.min(current, lastPage);
      if (resolvedPage !== current) {
        result = await request({ ...requestParams, current: resolvedPage, pageSize }, sorter, filters);
        if (generation !== listGeneration.current) return;
        if (!result.success) throw new Error("列表加载失败，请刷新重试");
      }
      state.current.current = resolvedPage;
      setDataSource(result.data);
      setSelectedRows((previous) => {
        const next = new Map(previous);
        for (const row of result.data) if (next.has(row.id)) next.set(row.id, row);
        return next;
      });
      setPagination({ current: resolvedPage, pageSize, total: result.total });
    } catch (error) {
      if (generation === listGeneration.current) {
        setDataSource([]);
        void message.error(error instanceof Error ? error.message : "列表加载失败，请刷新重试");
      }
    } finally {
      if (generation === listGeneration.current) setLoading(false);
    }
  }, [buildParams, message, request, requestSummary]);

  const onTableChange: NonNullable<TableProps<Row>["onChange"]> = (page, filters, sorter, extra) => {
    // Keep edits to selected rows when leaving their page.
    setSelectedRows((previous) => {
      const next = new Map(previous);
      for (const row of dataSource) if (next.has(row.id)) next.set(row.id, row);
      return next;
    });
    const sort = Array.isArray(sorter) ? sorter[0] : sorter;
    state.current.sorter = sort?.order && sort.field ? { [String(sort.field)]: sort.order } : {};
    state.current.filters = filters;
    const filtersChanged = extra.action === "filter";
    void loadRecords(state.current.params, {
      current: extra.action !== "paginate" || page.pageSize !== state.current.pageSize ? 1 : page.current,
      pageSize: page.pageSize,
      refreshSummary: filtersChanged,
      clearSelection: filtersChanged,
    });
  };

  const onSelectionChange = (keys: Key[], rows: Row[]) => {
    setSelectedRows(new Map(rows.filter(Boolean).map((row) => [row.id, row])));
    setSelectedRowKeys(keys);
  };
  const visibleRows = new Map(dataSource.map((row) => [row.id, row]));
  const selectedRecords = selectedRowKeys.flatMap((key) => {
    const row = visibleRows.get(String(key)) ?? selectedRows.get(String(key));
    return row ? [row] : [];
  });
  const reload = useCallback(() => loadRecords(state.current.params, { current: state.current.current }), [loadRecords]);
  const refresh = useCallback(() => loadRecords(state.current.params, { current: state.current.current, clearSelection: false }), [loadRecords]);

  return {
    dataSource, setDataSource, loading, summary, summaryLoading, loadRecords, reload, refresh,
    selectedRowKeys, setSelectedRowKeys, selectedRecords, onSelectionChange, onTableChange,
    pagination: { ...pagination, showSizeChanger: true, pageSizeOptions: [50, 100], showQuickJumper: true, showTotal: (total: number) => `共 ${total} 条` },
  };
}
