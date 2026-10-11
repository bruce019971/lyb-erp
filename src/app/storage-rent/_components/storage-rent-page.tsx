"use client";

import { ReloadOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Alert, App, Button, ConfigProvider, Select, Table, Tooltip, Typography } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  splitShipmentSearchValues,
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

const columns: ProColumns<StorageRentRecord>[] = [
  {
    title: "货件号",
    dataIndex: "shipment_no",
    width: 180,
    renderFormItem: () => (
      <Select
        mode="tags"
        allowClear
        open={false}
        maxTagCount={1}
        maxTagTextLength={18}
        tokenSeparators={[" ", "\n", "\t", ",", "，"]}
        placeholder="输入货件号，回车分隔"
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
    fieldProps: { placeholder: "请输入产品名称关键词" },
  },
  { title: "箱数", dataIndex: "box_count", width: 80, search: false },
  { title: "到仓日期", dataIndex: "overseas_warehouse_arrived_at", width: 110, search: false },
  { title: "送仓日期", dataIndex: "appointment_time", width: 110, search: false },
  { title: "超期天数", dataIndex: "overdue_days", width: 90, search: false },
  {
    title: "仓租",
    dataIndex: "storage_fee",
    width: 130,
    align: "right",
    search: false,
    render: (_, record) => record.storage_fee === null ? "-" : formatMoney(record.storage_fee),
  },
];

function StorageRentTable() {
  const { message } = App.useApp();
  const paramsRef = useRef<Record<string, unknown>>({});
  const requestVersion = useRef(0);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<StorageRentResult>({
    data: [], total: 0, total_fee: 0, missing_box_count: 0,
  });
  const [current, setCurrent] = useState(1);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    const params = new URLSearchParams();
    splitShipmentSearchValues(paramsRef.current.shipment_no).forEach((value) => {
      params.append("shipment_no", value);
    });
    const productName = paramsRef.current.product_name;
    if (typeof productName === "string" && productName.trim()) {
      params.set("product_name", productName.trim());
    }
    try {
      const response = await fetch(`/api/storage-rent?${params}`, { cache: "no-store" });
      const payload = await response.json() as StorageRentResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "仓租记录加载失败");
      if (version !== requestVersion.current) return;
      setResult(payload);
      setCurrent(1);
    } catch (error) {
      if (version !== requestVersion.current) return;
      setResult({ data: [], total: 0, total_fee: 0, missing_box_count: 0 });
      message.error(error instanceof Error ? error.message : "仓租记录加载失败");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [message]);

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

  return (
    <ProTable<StorageRentRecord>
      className={styles.table}
      rowKey="id"
      size="small"
      columns={columns}
      dataSource={result.data}
      loading={loading}
      headerTitle="仓租管理"
      tooltip="仅显示已到仓且已送仓的超期货件。到仓、送仓当天均计入，前30天免租；仓租 = 0.8 × 箱数 × 超期天数。"
      search={{ labelWidth: "auto", span: 8, collapsed: false, collapseRender: false }}
      options={false}
      toolBarRender={() => [
        <Tooltip key="reload" title="刷新列表">
          <Button type="text" icon={<ReloadOutlined />} onClick={() => void load()} />
        </Tooltip>,
      ]}
      tableExtraRender={() => result.missing_box_count > 0 ? (
        <Alert type="warning" showIcon message={`有 ${result.missing_box_count} 条货件缺少有效箱数，未计入仓租合计`} />
      ) : null}
      onSubmit={(values) => {
        paramsRef.current = values;
        void load();
      }}
      onReset={() => {
        paramsRef.current = {};
        void load();
      }}
      scroll={{ x: 920, y: "calc(100vh - 330px)" }}
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
            <Table.Summary.Cell index={0} colSpan={6}>
              合计（当前筛选全部 {result.total} 条）
            </Table.Summary.Cell>
            <Table.Summary.Cell index={6} align="right">
              {loading ? "计算中…" : formatMoney(result.total_fee)}
            </Table.Summary.Cell>
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
