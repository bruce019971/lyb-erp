"use client";

import { ReloadOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Alert, App, Button, ConfigProvider, Select, Table, Tag, Tooltip, Typography } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  splitShipmentSearchValues,
  normalizeProductSearchValues,
  type StorageRentFilterOptions,
  type StorageRentRecord,
  type StorageRentResult,
} from "../_lib/storage-rent";
import styles from "./storage-rent-page.module.css";

function formatMoney(value: number) {
  return `¥${value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getColumns(options: StorageRentFilterOptions, optionsLoading: boolean): ProColumns<StorageRentRecord>[] {
  return [
  {
    title: "货件号",
    dataIndex: "shipment_no",
    width: 180,
    renderFormItem: () => (
      <Select
        mode="tags"
        tokenSeparators={[" ", "\n", "\r", "\t", ",", "，"]}
        allowClear
        showSearch
        optionFilterProp="label"
        loading={optionsLoading}
        options={options.shipmentNos.map((value) => ({ label: value, value }))}
        maxTagCount={1}
        maxTagTextLength={18}
        placeholder="可选择或粘贴货件号，支持换行、空格、逗号分隔"
        className="w-full"
      />
    ),
    render: (_, record) => record.shipment_no
      ? <Typography.Text copyable>{record.shipment_no}</Typography.Text>
      : "-",
  },
  {
    title: "产品名称",
    dataIndex: "product_name",
    width: 220,
    ellipsis: true,
    valueType: "select",
    fieldProps: {
      mode: "multiple",
      allowClear: true,
      showSearch: true,
      optionFilterProp: "label",
      maxTagCount: 1,
      maxTagTextLength: 18,
      loading: optionsLoading,
      options: options.productNames.map((value) => ({ label: value, value })),
      placeholder: "请选择产品名称",
    },
  },
  { title: "箱数", dataIndex: "box_count", width: 80, search: false },
  { title: "到仓日期", dataIndex: "overseas_warehouse_arrived_at", width: 110, search: false },
  { title: "送仓日期", dataIndex: "appointment_time", width: 110, search: false },
  { title: "超期天数", dataIndex: "overdue_days", width: 90, search: false,
    render: (_, record) => record.overdue_days ?? "—" },
  {
    title: "仓租",
    dataIndex: "storage_fee",
    width: 130,
    align: "right",
    search: false,
    render: (_, record) => record.storage_fee === null
      ? <Tooltip title={record.calculation_note}><span>—</span></Tooltip>
      : formatMoney(record.storage_fee),
  },
  {
    title: "是否支付",
    dataIndex: "storage_rent_paid_status",
    width: 110,
    search: false,
    render: (_, record) => record.storage_rent_paid_status === "是"
      ? <Tag color="success">已支付</Tag>
      : <Tag>未支付</Tag>,
  },
];
}

function StorageRentTable() {
  const { message, modal } = App.useApp();
  const paramsRef = useRef<Record<string, unknown>>({});
  const requestVersion = useRef(0);
  const [loading, setLoading] = useState(true);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState<StorageRentResult>({
    data: [], total: 0, total_fee: 0, uncalculated_count: 0,
  });
  const [current, setCurrent] = useState(1);
  const [filterOptions, setFilterOptions] = useState<StorageRentFilterOptions>({
    shipmentNos: [], productNames: [],
  });
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const columns = useMemo(() => getColumns(filterOptions, optionsLoading), [filterOptions, optionsLoading]);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setSelectedRowKeys([]);
    setLoadError(null);
    const params = new URLSearchParams();
    splitShipmentSearchValues(paramsRef.current.shipment_no).forEach((value) => {
      params.append("shipment_no", value);
    });
    normalizeProductSearchValues(paramsRef.current.product_name).forEach((value) => {
      params.append("product_name", value);
    });
    try {
      const response = await fetch(`/api/storage-rent?${params}`, { cache: "no-store" });
      const payload = await response.json() as StorageRentResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "仓租记录加载失败");
      if (version !== requestVersion.current) return;
      setResult(payload);
      setCurrent(1);
    } catch (error) {
      if (version !== requestVersion.current) return;
      setResult({ data: [], total: 0, total_fee: 0, uncalculated_count: 0 });
      const errorMessage = error instanceof Error ? error.message : "仓租记录加载失败";
      setLoadError(errorMessage);
      message.error(errorMessage);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [message]);

  function markSelectedPaid() {
    const records = result.data.filter((record) => selectedRowKeys.includes(record.id));
    if (!records.length || paying || loading) return;
    if (records.length > 500) {
      message.warning("每次最多设置500条仓租记录");
      return;
    }
    modal.confirm({
      title: "批量设置已支付",
      content: `将选中的 ${records.length} 条仓租记录标记为已支付，合计 ${formatMoney(records.reduce((sum, record) => sum + Math.round((record.storage_fee ?? 0) * 100), 0) / 100)}。`,
      okText: "确认已支付",
      cancelText: "取消",
      async onOk() {
        setPaying(true);
        try {
          const response = await fetch("/api/storage-rent", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: records.map((record) => record.id) }),
          });
          const payload = await response.json() as { updatedCount?: number; error?: string };
          if (!response.ok) throw new Error(payload.error || "批量设置已支付失败");
          if (payload.updatedCount) message.success(`已将 ${payload.updatedCount} 条仓租记录设置为已支付`);
          else message.info("所选记录没有待更新的支付状态，已刷新列表");
        } catch (error) {
          message.error(error instanceof Error ? error.message : "批量设置已支付失败");
        } finally {
          await load();
          setPaying(false);
        }
      },
    });
  }

  useEffect(() => {
    let cancelled = false;
    window.queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
      requestVersion.current += 1;
    };
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    async function loadOptions() {
      try {
        const response = await fetch("/api/storage-rent?options=1", { cache: "no-store" });
        const payload = await response.json() as StorageRentFilterOptions & { error?: string };
        if (!response.ok) throw new Error(payload.error || "货件筛选选项加载失败");
        if (!cancelled) setFilterOptions(payload);
      } catch (error) {
        if (!cancelled) message.error(error instanceof Error ? error.message : "货件筛选选项加载失败");
      } finally {
        if (!cancelled) setOptionsLoading(false);
      }
    }
    void loadOptions();
    return () => { cancelled = true; };
  }, [message]);

  return (
    <ProTable<StorageRentRecord>
      className={styles.table}
      rowKey="id"
      size="small"
      columns={columns}
      dataSource={result.data}
      loading={loading || paying}
      rowSelection={{
        selectedRowKeys,
        preserveSelectedRowKeys: true,
        onChange: setSelectedRowKeys,
        getCheckboxProps: (record) => ({
          disabled: loading || paying || record.storage_rent_paid_status === "是" || record.storage_fee === null,
          title: record.storage_rent_paid_status === "是" ? "仓租已支付"
            : record.storage_fee === null ? record.calculation_note ?? "仓租无法计算" : undefined,
        }),
      }}
      headerTitle="仓租管理"
      tooltip="显示所有已填写送仓时间的有效货件，包括尚未送仓的货件。仓储天数按送仓日期减到仓日期计算，前30天免租，超期天数最低为0；第31–60天每箱每天0.8元，第61–90天每箱每天1元，分段累计计算仓租。"
      search={{ labelWidth: "auto", span: 8, collapsed: false, collapseRender: false }}
      options={false}
      toolBarRender={() => [
        <Button key="paid" type="primary" loading={paying}
          disabled={loading || selectedRowKeys.length === 0} onClick={markSelectedPaid}>
          批量设置已支付{selectedRowKeys.length > 0 ? `（${selectedRowKeys.length}）` : ""}
        </Button>,
        <Tooltip key="reload" title="刷新列表">
          <Button type="text" icon={<ReloadOutlined />} disabled={paying} onClick={() => void load()} />
        </Tooltip>,
      ]}
      tableExtraRender={() => loadError ? (
        <Alert type="error" showIcon message={loadError} />
      ) : result.uncalculated_count > 0 ? (
        <Alert type="warning" showIcon message={`有 ${result.uncalculated_count} 条货件因日期或箱数缺失、无效而无法计算仓租，未计入合计；悬停仓租可查看原因`} />
      ) : null}
      onSubmit={(values) => {
        paramsRef.current = values;
        void load();
      }}
      onReset={() => {
        paramsRef.current = {};
        void load();
      }}
      scroll={{ x: 1070, y: "calc(100vh - 330px)" }}
      pagination={{
        current,
        pageSize: 50,
        showSizeChanger: false,
        showTotal: (total) => `共 ${total} 条`,
        onChange: setCurrent,
      }}
      summary={() => (
        <Table.Summary fixed="bottom">
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={7}>
              合计（当前筛选全部 {result.total} 条）
            </Table.Summary.Cell>
            <Table.Summary.Cell index={7} align="right">
              {loading ? "计算中…" : formatMoney(result.total_fee)}
            </Table.Summary.Cell>
            <Table.Summary.Cell index={8} />
          </Table.Summary.Row>
        </Table.Summary>
      )}
    />
  );
}

export default function StorageRentPage() {
  return (
    <ConfigProvider locale={zhCN} theme={{ token: { borderRadius: 6, colorPrimary: "#1677ff" } }}>
      <App>
        <main className="h-full overflow-auto bg-slate-100 px-6 py-6">
          <section className="mx-auto max-w-[1600px]">
            <StorageRentTable />
          </section>
        </main>
      </App>
    </ConfigProvider>
  );
}
