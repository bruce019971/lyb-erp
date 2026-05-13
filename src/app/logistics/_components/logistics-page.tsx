"use client";

import type { ActionType } from "@ant-design/pro-components";
import { App, ConfigProvider } from "antd";
import { useEffect, useRef, useState } from "react";

import ShipmentsTableSkeleton from "../../shipments/_components/shipments-table-skeleton";
import LogisticsCreateDrawer from "./logistics-create-drawer";
import LogisticsHeader from "./logistics-header";
import LogisticsTable from "./logistics-table";

export default function LogisticsPage() {
  const [mounted, setMounted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const tableActionRef = useRef<ActionType>(undefined);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <ConfigProvider
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
            <LogisticsHeader
              onReload={() => tableActionRef.current?.reload()}
              onCreate={() => setCreateOpen(true)}
              canReload={mounted}
            />

            {mounted ? (
              <LogisticsTable actionRef={tableActionRef} />
            ) : (
              <ShipmentsTableSkeleton />
            )}
          </section>
        </main>
        {mounted ? (
          <LogisticsCreateDrawer
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            onCreated={() => {
              setCreateOpen(false);
              tableActionRef.current?.reload();
            }}
          />
        ) : null}
      </App>
    </ConfigProvider>
  );
}
