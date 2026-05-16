"use client";

import type { ActionType } from "@ant-design/pro-components";
import { App, ConfigProvider, message } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useEffect, useRef, useState } from "react";

import type { StoreOption } from "../../stores/_lib/stores";
import { requestStoreOptions } from "../../stores/_lib/stores-request";
import type { ShipmentOption } from "../../shipments/_lib/shipments";
import { requestShipmentOptions } from "../../shipments/_lib/shipments-request";
import ShipmentsTableSkeleton from "../../shipments/_components/shipments-table-skeleton";
import type { RelabelRecord } from "../_lib/relabels";
import { markRelabelStatusAsYes } from "../_lib/relabels-request";
import RelabelFormDrawer from "./relabel-form-drawer";
import RelabelsTable from "./relabels-table";

dayjs.locale("zh-cn");

export default function RelabelsPage() {
  const [mounted, setMounted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RelabelRecord | undefined>(
    undefined,
  );
  const [shipmentOptions, setShipmentOptions] = useState<ShipmentOption[]>([]);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [updatingStatusKey, setUpdatingStatusKey] = useState<string | null>(null);
  const tableActionRef = useRef<ActionType>(undefined);
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;

    async function loadOptions() {
      try {
        const [shipments, stores] = await Promise.all([
          requestShipmentOptions(),
          requestStoreOptions(),
        ]);

        if (!cancelled) {
          setShipmentOptions(shipments);
          setStoreOptions(stores.filter((item) => item.seller_name?.trim()));
        }
      } catch {
        if (!cancelled) {
          setShipmentOptions([]);
          setStoreOptions([]);
        }
      }
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, [mounted]);

  function isStatusUpdating(
    record: RelabelRecord,
    field: "instruction_submitted" | "delivery_status",
  ) {
    return updatingStatusKey === `${record.id}:${field}`;
  }

  async function handleChangeStatus(
    record: RelabelRecord,
    field: "instruction_submitted" | "delivery_status",
    value: string,
  ) {
    if (value !== "是" || record[field] === "是") return;

    try {
      setUpdatingStatusKey(`${record.id}:${field}`);
      await markRelabelStatusAsYes(record.id, field);
      messageApi.success("状态已更新为“是”");
      tableActionRef.current?.reload();
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "请检查数据库权限或记录状态";
      messageApi.error(`状态更新失败：${description}`);
    } finally {
      setUpdatingStatusKey(null);
    }
  }

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
        {contextHolder}
        <main className="h-full overflow-auto bg-slate-100 px-6 py-6">
          <section className="mx-auto flex max-w-[1600px] flex-col gap-4">
            {mounted ? (
              <RelabelsTable
                actionRef={tableActionRef}
                onCreate={() => setCreateOpen(true)}
                onEdit={(record) => {
                  setEditingRecord(record);
                  setEditOpen(true);
                }}
                onChangeInstructionSubmitted={(record, value) =>
                  void handleChangeStatus(
                    record,
                    "instruction_submitted",
                    value,
                  )
                }
                onChangeDeliveryStatus={(record, value) =>
                  void handleChangeStatus(record, "delivery_status", value)
                }
                isStatusUpdating={isStatusUpdating}
              />
            ) : (
              <ShipmentsTableSkeleton />
            )}
          </section>
        </main>
        {mounted ? (
          <RelabelFormDrawer
            open={createOpen}
            mode="create"
            shipmentOptions={shipmentOptions}
            storeOptions={storeOptions}
            onClose={() => setCreateOpen(false)}
            onSaved={() => {
              setCreateOpen(false);
              tableActionRef.current?.reload();
            }}
          />
        ) : null}
        {mounted ? (
          <RelabelFormDrawer
            open={editOpen}
            mode="edit"
            record={editingRecord}
            shipmentOptions={shipmentOptions}
            storeOptions={storeOptions}
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
