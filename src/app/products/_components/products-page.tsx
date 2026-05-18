"use client";

import type { ActionType } from "@ant-design/pro-components";
import type { FormInstance } from "antd";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import ShipmentsTableSkeleton from "../../shipments/_components/shipments-table-skeleton";
import type {
  ProductFilterOption,
  ProductRecord,
} from "../_lib/products";
import { requestProductFilterOptions } from "../_lib/products-request";
import ProductFormDrawer from "./product-form-drawer";
import ProductsTable from "./products-table";
import ProductViewDrawer from "./product-view-drawer";

dayjs.locale("zh-cn");

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ProductRecord | undefined>(
    undefined,
  );
  const [viewingRecord, setViewingRecord] = useState<ProductRecord | undefined>(
    undefined,
  );
  const [productNameOptions, setProductNameOptions] = useState<
    ProductFilterOption[]
  >([]);
  const [skuOptions, setSkuOptions] = useState<ProductFilterOption[]>([]);
  const [storeNameOptions, setStoreNameOptions] = useState<
    ProductFilterOption[]
  >([]);
  const tableActionRef = useRef<ActionType>(undefined);
  const searchFormRef = useRef<FormInstance>(undefined);

  useEffect(() => {
    if (!mounted) return;

    const productName = searchParams.get("product_name")?.trim();
    const storeName = searchParams.get("store_name")?.trim();

    if (!productName && !storeName) {
      return;
    }

    searchFormRef.current?.setFieldsValue({
      product_name: productName ? [productName] : undefined,
      store_name: storeName ? [storeName] : undefined,
    });
    searchFormRef.current?.submit?.();
  }, [mounted, searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;

    async function loadFilterOptions() {
      try {
        const options = await requestProductFilterOptions();
        if (cancelled) return;

        setProductNameOptions(options.productNameOptions);
        setSkuOptions(options.skuOptions);
        setStoreNameOptions(options.storeNameOptions);
      } catch {
        if (cancelled) return;

        setProductNameOptions([]);
        setSkuOptions([]);
        setStoreNameOptions([]);
      }
    }

    void loadFilterOptions();

    return () => {
      cancelled = true;
    };
  }, [mounted]);

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
              <ProductsTable
                actionRef={tableActionRef}
                formRef={searchFormRef}
                onCreate={() => setCreateOpen(true)}
                onView={(record) => {
                  setViewingRecord(record);
                  setViewOpen(true);
                }}
                onEdit={(record) => {
                  setEditingRecord(record);
                  setEditOpen(true);
                }}
                productNameOptions={productNameOptions}
                skuOptions={skuOptions}
                storeNameOptions={storeNameOptions}
              />
            ) : (
              <ShipmentsTableSkeleton />
            )}
          </section>
        </main>
        {mounted ? (
          <ProductViewDrawer
            open={viewOpen}
            record={viewingRecord}
            onClose={() => {
              setViewOpen(false);
              setViewingRecord(undefined);
            }}
          />
        ) : null}
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
