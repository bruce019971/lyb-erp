"use client";

import { ExclamationCircleFilled } from "@ant-design/icons";
import type { ActionType } from "@ant-design/pro-components";
import { App, ConfigProvider, Modal, message } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import { requestLogisticsProviderOptions } from "../../logistics/_lib/logistics-request";
import type { StoreOption } from "../../stores/_lib/stores";
import { requestStoreOptions } from "../../stores/_lib/stores-request";
import type { ShipmentOption } from "../../shipments/_lib/shipments";
import { requestShipmentOptions } from "../../shipments/_lib/shipments-request";
import ShipmentsTableSkeleton from "../../shipments/_components/shipments-table-skeleton";
import type { RelabelRecord } from "../_lib/relabels";
import {
  deleteRelabelRecord,
  markRelabelStatusAsYes,
} from "../_lib/relabels-request";
import RelabelFormDrawer from "./relabel-form-drawer";
import RelabelsTable from "./relabels-table";

dayjs.locale("zh-cn");

export default function RelabelsPage() {
  const searchParams = useSearchParams();
  const originalShipmentNo = searchParams.get("original_shipment_no")?.trim();
  const [mounted, setMounted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RelabelRecord | undefined>(
    undefined,
  );
  const [shipmentOptions, setShipmentOptions] = useState<ShipmentOption[]>([]);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [logisticsOptions, setLogisticsOptions] = useState<
    LogisticsProviderOption[]
  >([]);
  const [editingDeliveryStatusId, setEditingDeliveryStatusId] = useState<
    string | null
  >(null);
  const [updatingStatusKey, setUpdatingStatusKey] = useState<string | null>(
    null,
  );
  const [deletingRelabelId, setDeletingRelabelId] = useState<string | null>(
    null,
  );
  const tableActionRef = useRef<ActionType>(undefined);
  const [messageApi, contextHolder] = message.useMessage();
  const [modalApi, modalContextHolder] = Modal.useModal();

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;

    async function loadOptions() {
      const [shipmentsResult, storesResult, logisticsProvidersResult] =
        await Promise.allSettled([
          requestShipmentOptions(),
          requestStoreOptions(),
          requestLogisticsProviderOptions(),
        ]);

      if (!cancelled) {
        setShipmentOptions(
          shipmentsResult.status === "fulfilled" ? shipmentsResult.value : [],
        );
        setStoreOptions(
          storesResult.status === "fulfilled"
            ? storesResult.value.filter((item) => item.seller_name?.trim())
            : [],
        );
        setLogisticsOptions(
          logisticsProvidersResult.status === "fulfilled"
            ? logisticsProvidersResult.value.filter((item) =>
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

  function isStatusUpdating(record: RelabelRecord, field: "delivery_status") {
    return updatingStatusKey === `${record.id}:${field}`;
  }

  function isDeliveryStatusEditing(record: RelabelRecord) {
    return editingDeliveryStatusId === record.id;
  }

  function isDeleting(record: RelabelRecord) {
    return deletingRelabelId === record.id;
  }

  async function handleChangeStatus(
    record: RelabelRecord,
    field: "delivery_status",
    value: string,
  ) {
    if (value !== "是" || record[field] === "是") {
      setEditingDeliveryStatusId(null);
      return;
    }

    try {
      setUpdatingStatusKey(`${record.id}:${field}`);
      await markRelabelStatusAsYes(record.id, field);
      messageApi.success("状态已更新为“是”");
      setEditingDeliveryStatusId(null);
      tableActionRef.current?.reload();
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "请检查数据库权限或记录状态";
      messageApi.error(`状态更新失败：${description}`);
    } finally {
      setUpdatingStatusKey(null);
    }
  }

  function handleDelete(record: RelabelRecord) {
    if (record.delivery_time?.trim()) {
      messageApi.warning("送仓时间不为空的货件不允许删除");
      return;
    }

    modalApi.confirm({
      title: "删除换标记录",
      icon: <ExclamationCircleFilled className="!text-amber-500" />,
      content: "此操作将永久删除该换标记录，是否继续？",
      okText: "确定删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      centered: true,
      onOk: async () => {
        try {
          setDeletingRelabelId(record.id);
          await deleteRelabelRecord(record.id);
          messageApi.success("换标记录删除成功");
          tableActionRef.current?.reload();
        } catch (error) {
          const description =
            error instanceof Error
              ? error.message
              : "请检查数据库权限或记录状态";
          messageApi.error(`换标记录删除失败：${description}`);
          throw error;
        } finally {
          setDeletingRelabelId(null);
        }
      },
    });
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
        {modalContextHolder}
        <main className="h-full overflow-auto bg-slate-100 px-6 py-6">
          <section className="mx-auto flex max-w-[1600px] flex-col gap-4">
            {mounted ? (
              <RelabelsTable
                actionRef={tableActionRef}
                originalShipmentNo={originalShipmentNo}
                onCreate={() => setCreateOpen(true)}
                onEdit={(record) => {
                  setEditingRecord(record);
                  setEditOpen(true);
                }}
                onDelete={(record) => void handleDelete(record)}
                onStartDeliveryStatusEdit={(record) =>
                  setEditingDeliveryStatusId(record.id)
                }
                onCancelDeliveryStatusEdit={() =>
                  setEditingDeliveryStatusId(null)
                }
                onChangeDeliveryStatus={(record, value) =>
                  void handleChangeStatus(record, "delivery_status", value)
                }
                isDeliveryStatusEditing={isDeliveryStatusEditing}
                isStatusUpdating={isStatusUpdating}
                isDeleting={isDeleting}
                logisticsOptions={logisticsOptions}
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
            logisticsOptions={logisticsOptions}
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
            logisticsOptions={logisticsOptions}
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
