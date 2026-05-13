"use client";

import type { ActionType } from "@ant-design/pro-components";
import { App, ConfigProvider } from "antd";
import { useEffect, useRef, useState } from "react";

import ShipmentsTableSkeleton from "../../shipments/_components/shipments-table-skeleton";
import type { ProductRecord } from "../_lib/products";
import ProductFormDrawer from "./product-form-drawer";
import ProductsHeader from "./products-header";
import ProductsTable from "./products-table";

export default function ProductsPage() {
  const [mounted, setMounted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ProductRecord | undefined>(
    undefined,
  );
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
            <ProductsHeader
              onReload={() => tableActionRef.current?.reload()}
              onCreate={() => setCreateOpen(true)}
              canReload={mounted}
            />

            {mounted ? (
              <ProductsTable
                actionRef={tableActionRef}
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
          <ProductFormDrawer
            open={createOpen}
            mode="create"
            onClose={() => setCreateOpen(false)}
            onSaved={() => {
              setCreateOpen(false);
              tableActionRef.current?.reload();
            }}
          />
        ) : null}
        {mounted && editingRecord ? (
          <ProductFormDrawer
            open={editOpen}
            mode="edit"
            record={editingRecord}
            onClose={() => {
              setEditOpen(false);
              setEditingRecord(undefined);
            }}
            onSaved={() => {
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
