"use client";

import type { ActionType } from "@ant-design/pro-components";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useEffect, useRef, useState } from "react";

import ShipmentsTableSkeleton from "../../shipments/_components/shipments-table-skeleton";
import StoreCreateDrawer from "./store-create-drawer";
import StoreEditDrawer from "./store-edit-drawer";
import StoresTable from "./stores-table";
import type { StoreRecord } from "../_lib/stores";

dayjs.locale("zh-cn");

export default function StoresPage() {
  const [mounted, setMounted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<StoreRecord | undefined>(
    undefined,
  );
  const tableActionRef = useRef<ActionType>(undefined);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          borderRadius: 6,
          colorPrimary: "#1677ff",
        },
      }}
    >
      <App>
        <main className="h-full overflow-auto bg-slate-100 px-6 py-6">
          <section className="mx-auto flex max-w-[1600px] flex-col gap-4">
            {mounted ? (
              <StoresTable
                actionRef={tableActionRef}
                onCreate={() => setCreateOpen(true)}
                onEdit={(record) => {
                  setEditingRecord(record);
                  setEditOpen(true);
                }}
              />
            ) : (
              <ShipmentsTableSkeleton />
            )}
          </section>
        </main>
        {mounted ? (
          <StoreCreateDrawer
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            onCreated={() => {
              setCreateOpen(false);
              tableActionRef.current?.reload();
            }}
          />
        ) : null}
        {mounted ? (
          <StoreEditDrawer
            open={editOpen}
            record={editingRecord}
            onClose={() => setEditOpen(false)}
            onUpdated={() => {
              setEditOpen(false);
              setEditingRecord(undefined);
              tableActionRef.current?.reload();
            }}
          />
        ) : null}
      </App>
    </ConfigProvider>
  );
}
