"use client";

import type { ActionType } from "@ant-design/pro-components";
import { ConfigProvider } from "antd";
import { useEffect, useRef, useState } from "react";

import ShipmentsHeader from "./shipments-header";
import ShipmentsTable from "./shipments-table";
import ShipmentsTableSkeleton from "./shipments-table-skeleton";

type ShipmentsPageProps = {
  embedded?: boolean;
};

export default function ShipmentsPage({ embedded = false }: ShipmentsPageProps) {
  const [mounted, setMounted] = useState(false);
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
      <main
        className={
          embedded
            ? "h-full overflow-auto bg-slate-100 px-6 py-6"
            : "min-h-screen bg-slate-100 px-6 py-6"
        }
      >
        <section className="mx-auto flex max-w-[1600px] flex-col gap-4">
          <ShipmentsHeader
            onReload={() => tableActionRef.current?.reload()}
            canReload={mounted}
          />

          {mounted ? (
            <ShipmentsTable actionRef={tableActionRef} />
          ) : (
            <ShipmentsTableSkeleton />
          )}
        </section>
      </main>
    </ConfigProvider>
  );
}
