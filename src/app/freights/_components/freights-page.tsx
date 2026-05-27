"use client";

import type { ActionType } from "@ant-design/pro-components";
import { App, ConfigProvider, Modal, message } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useEffect, useRef, useState } from "react";

import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import { requestLogisticsProviderOptions } from "../../logistics/_lib/logistics-request";
import type { ShipmentOption } from "../../shipments/_lib/shipments";
import { requestShipmentOptions } from "../../shipments/_lib/shipments-request";
import ShipmentsTableSkeleton from "../../shipments/_components/shipments-table-skeleton";
import type { FreightRecord } from "../_lib/freights";
import { updateFreightRecord } from "../_lib/freights-request";
import FreightsEditDrawer from "./freights-edit-drawer";
import FreightsTable from "./freights-table";

dayjs.locale("zh-cn");

export default function FreightsPage() {
  const [mounted, setMounted] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<FreightRecord | undefined>(
    undefined,
  );
  const [calculatingFreightId, setCalculatingFreightId] = useState<string | null>(
    null,
  );
  const [shipmentOptions, setShipmentOptions] = useState<ShipmentOption[]>([]);
  const [logisticsOptions, setLogisticsOptions] = useState<
    LogisticsProviderOption[]
  >([]);
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
      try {
        const [shipments, logisticsProviders] = await Promise.all([
          requestShipmentOptions(),
          requestLogisticsProviderOptions(),
        ]);

        if (!cancelled) {
          setShipmentOptions(
            shipments.filter(
              (item) =>
                item.shipment_no?.trim() ||
                item.tracking_no?.trim() ||
                item.product_name?.trim(),
            ),
          );
          setLogisticsOptions(
            logisticsProviders.filter((item) => item.provider_name?.trim()),
          );
        }
      } catch {
        if (!cancelled) {
          setShipmentOptions([]);
          setLogisticsOptions([]);
        }
      }
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, [mounted]);

  function calculateTotalFee(record: FreightRecord) {
    const freightUnitPrice = record.freight_unit_price;
    const volume = record.volume;

    if (
      typeof freightUnitPrice !== "number" ||
      !Number.isFinite(freightUnitPrice) ||
      typeof volume !== "number" ||
      !Number.isFinite(volume)
    ) {
      return null;
    }

    return Number((freightUnitPrice * volume).toFixed(2));
  }

  async function calculateAndSaveFreight(record: FreightRecord, totalFee: number) {
    try {
      setCalculatingFreightId(record.id);
      await updateFreightRecord(record.id, {
        freight_unit_price: record.freight_unit_price,
        volume: record.volume,
        extra_fee: record.extra_fee,
        total_fee: totalFee,
        freight_paid_status: record.freight_paid_status ?? "否",
      });
      messageApi.success("总费用已计算并保存");
      tableActionRef.current?.reload();
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "请检查数据库权限或字段内容";
      messageApi.error(`总费用计算失败：${description}`);
    } finally {
      setCalculatingFreightId(null);
    }
  }

  function handleCalculateFreight(record: FreightRecord) {
    const totalFee = calculateTotalFee(record);

    if (totalFee === null) {
      messageApi.warning("请先填写运费单价和方数");
      return;
    }

    if (typeof record.total_fee === "number" && Number.isFinite(record.total_fee)) {
      modalApi.confirm({
        title: "是否覆盖总费用？",
        content: `当前总费用已有值 ${record.total_fee}，是否覆盖为 ${totalFee}？`,
        okText: "覆盖",
        cancelText: "取消",
        centered: true,
        onOk: () => calculateAndSaveFreight(record, totalFee),
      });
      return;
    }

    void calculateAndSaveFreight(record, totalFee);
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
        <main className="h-full overflow-hidden bg-slate-100 px-6 py-6">
          <section className="mx-auto flex h-full min-h-0 max-w-[1600px] flex-col gap-4">
            {mounted ? (
              <FreightsTable
                actionRef={tableActionRef}
                shipmentOptions={shipmentOptions}
                logisticsOptions={logisticsOptions}
                onEdit={(record) => {
                  setEditingRecord(record);
                  setEditOpen(true);
                }}
                onCalculateFreight={handleCalculateFreight}
                isCalculatingFreight={(record) =>
                  calculatingFreightId === record.id
                }
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
