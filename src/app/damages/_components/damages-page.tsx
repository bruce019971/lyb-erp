"use client";

import type { ActionType } from "@ant-design/pro-components";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useCallback, useEffect, useRef, useState } from "react";

import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import { requestLogisticsProviderOptions } from "../../logistics/_lib/logistics-request";
import ShipmentsTableSkeleton from "../../shipments/_components/shipments-table-skeleton";
import type { DamageShipmentOption } from "../_lib/damages";
import { requestDamageShipmentOptions } from "../_lib/damages-request";
import DamageCreateModal from "./damage-create-modal";
import DamagesTable from "./damages-table";

dayjs.locale("zh-cn");

export default function DamagesPage() {
  const [mounted, setMounted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [shipmentOptions, setShipmentOptions] = useState<DamageShipmentOption[]>([]);
  const [logisticsOptions, setLogisticsOptions] = useState<
    LogisticsProviderOption[]
  >([]);
  const tableActionRef = useRef<ActionType>(undefined);

  const refreshShipmentOptions = useCallback(async () => {
    const options = await requestDamageShipmentOptions();
    setShipmentOptions(options);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;

    async function loadOptions() {
      const [shipmentsResult, logisticsResult] = await Promise.allSettled([
        requestDamageShipmentOptions(),
        requestLogisticsProviderOptions(),
      ]);

      if (!cancelled) {
        setShipmentOptions(
          shipmentsResult.status === "fulfilled" ? shipmentsResult.value : [],
        );
        setLogisticsOptions(
          logisticsResult.status === "fulfilled"
            ? logisticsResult.value.filter((item) =>
                item.provider_name?.trim(),
              )
            : [],
        );
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
      theme={{ token: { borderRadius: 6, colorPrimary: "#1677ff" } }}
    >
      <App>
        <main className="h-full overflow-auto bg-slate-100 px-6 py-6">
          <section className="mx-auto flex max-w-[1600px] flex-col gap-4">
            {mounted ? (
              <DamagesTable
                actionRef={tableActionRef}
                shipmentOptions={shipmentOptions}
                logisticsOptions={logisticsOptions}
                onCreate={() => setCreateOpen(true)}
              />
            ) : (
              <ShipmentsTableSkeleton />
            )}
          </section>
        </main>
        {mounted ? (
          <DamageCreateModal
            open={createOpen}
            shipmentOptions={shipmentOptions}
            onRefreshShipmentOptions={refreshShipmentOptions}
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
