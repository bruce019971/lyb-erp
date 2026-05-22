"use client";

import type { ActionType } from "@ant-design/pro-components";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useEffect, useRef, useState } from "react";

import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import { requestLogisticsProviderOptions } from "../../logistics/_lib/logistics-request";
import ShipmentsTableSkeleton from "../../shipments/_components/shipments-table-skeleton";
import type { FreightRecord } from "../_lib/freights";
import FreightsEditDrawer from "./freights-edit-drawer";
import FreightsTable from "./freights-table";

dayjs.locale("zh-cn");

export default function FreightsPage() {
  const [mounted, setMounted] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<FreightRecord | undefined>(
    undefined,
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
        const logisticsProviders = await requestLogisticsProviderOptions();

        if (!cancelled) {
          setLogisticsOptions(
            logisticsProviders.filter((item) => item.provider_name?.trim()),
          );
        }
      } catch {
        if (!cancelled) {
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
      <App>
        <main className="h-full overflow-hidden bg-slate-100 px-6 py-6">
          <section className="mx-auto flex h-full min-h-0 max-w-[1600px] flex-col gap-4">
            {mounted ? (
              <FreightsTable
                actionRef={tableActionRef}
                logisticsOptions={logisticsOptions}
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
          <FreightsEditDrawer
            open={editOpen}
            record={editingRecord}
            onClose={() => {
              setEditOpen(false);
              setEditingRecord(undefined);
            }}
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
