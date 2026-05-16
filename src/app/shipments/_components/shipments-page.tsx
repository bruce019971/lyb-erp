"use client";

import type { ActionType } from "@ant-design/pro-components";
import { App as AntApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useEffect, useRef, useState } from "react";

import type { ShipmentRecord } from "../_lib/shipments";
import type { ProductShipmentOption } from "../../products/_lib/products";
import { requestProductShipmentOptions } from "../../products/_lib/products-request";
import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import { requestLogisticsProviderOptions } from "../../logistics/_lib/logistics-request";
import type { StoreOption } from "../../stores/_lib/stores";
import { requestStoreOptions } from "../../stores/_lib/stores-request";
import ShipmentCreateDrawer from "./shipment-create-drawer";
import ShipmentEditDrawer from "./shipment-edit-drawer";
import ShipmentsTable from "./shipments-table";
import ShipmentsTableSkeleton from "./shipments-table-skeleton";

type ShipmentsPageProps = {
  embedded?: boolean;
};

dayjs.locale("zh-cn");

export default function ShipmentsPage({ embedded = false }: ShipmentsPageProps) {
  const [mounted, setMounted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<
    ShipmentRecord | undefined
  >(undefined);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [productOptions, setProductOptions] = useState<ProductShipmentOption[]>(
    [],
  );
  const [logisticsOptions, setLogisticsOptions] = useState<
    LogisticsProviderOption[]
  >([]);
  const tableActionRef = useRef<ActionType>(undefined);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;

    async function loadOptions() {
      try {
        const [stores, products, logisticsProviders] = await Promise.all([
          requestStoreOptions(),
          requestProductShipmentOptions(),
          requestLogisticsProviderOptions(),
        ]);

        if (!cancelled) {
          setStoreOptions(
            stores.filter((item) => item.seller_name?.trim()),
          );
          setProductOptions(
            products.filter((item) => item.product_name?.trim()),
          );
          setLogisticsOptions(
            logisticsProviders.filter((item) => item.provider_name?.trim()),
          );
        }
      } catch {
        if (!cancelled) {
          setStoreOptions([]);
          setProductOptions([]);
          setLogisticsOptions([]);
        }
      }
    }

    void loadOptions();

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
      <AntApp>
        <main
          className={
            embedded
              ? "h-full overflow-auto bg-slate-100 px-6 py-6"
              : "min-h-screen bg-slate-100 px-6 py-6"
          }
        >
          <section className="mx-auto flex max-w-[1600px] flex-col gap-4">
            {mounted ? (
              <ShipmentsTable
                actionRef={tableActionRef}
                onCreate={() => setCreateOpen(true)}
                onEdit={(record) => {
                  setEditingRecord(record);
                  setEditOpen(true);
                }}
                storeOptions={storeOptions}
                productOptions={productOptions}
                logisticsOptions={logisticsOptions}
              />
            ) : (
              <ShipmentsTableSkeleton />
            )}
          </section>
        </main>
        {mounted ? (
          <ShipmentCreateDrawer
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            onCreated={() => {
              setCreateOpen(false);
              tableActionRef.current?.reload();
            }}
            storeOptions={storeOptions}
            productOptions={productOptions}
            logisticsOptions={logisticsOptions}
          />
        ) : null}
        {mounted ? (
          <ShipmentEditDrawer
            open={editOpen}
            record={editingRecord}
            onClose={() => setEditOpen(false)}
            onUpdated={() => {
              setEditOpen(false);
              setEditingRecord(undefined);
              tableActionRef.current?.reload();
            }}
            storeOptions={storeOptions}
            productOptions={productOptions}
            logisticsOptions={logisticsOptions}
          />
        ) : null}
      </AntApp>
    </ConfigProvider>
  );
}
