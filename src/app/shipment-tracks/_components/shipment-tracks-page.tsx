"use client";

import type { ActionType } from "@ant-design/pro-components";
import { App, ConfigProvider, Modal, message } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useEffect, useRef, useState } from "react";

import type { ShipmentOption } from "../../shipments/_lib/shipments";
import {
  getRishenghuiAccessToken,
  requestShipmentOptions,
} from "../../shipments/_lib/shipments-request";
import {
  clearStoredRishenghuiAccessToken,
  getStoredRishenghuiAccessToken,
  saveStoredRishenghuiAccessToken,
} from "../../shipments/_lib/rishenghui-token-storage";
import RishenghuiAuthModal from "../../shipments/_components/rishenghui-auth-modal";
import ShipmentsTableSkeleton from "../../shipments/_components/shipments-table-skeleton";
import ShipmentTracksTable from "./shipment-tracks-table";

type PendingRishenghuiAction = (accessToken: string) => void | Promise<void>;

export default function ShipmentTracksPage() {
  const [mounted, setMounted] = useState(false);
  const [rishenghuiAuthOpen, setRishenghuiAuthOpen] = useState(false);
  const [rishenghuiAccessToken, setRishenghuiAccessToken] = useState("");
  const [shipmentOptions, setShipmentOptions] = useState<ShipmentOption[]>([]);
  const [messageApi, contextHolder] = message.useMessage();
  const [modalApi, modalContextHolder] = Modal.useModal();
  const tableActionRef = useRef<ActionType>(undefined);
  const pendingRishenghuiActionRef = useRef<PendingRishenghuiAction | null>(
    null,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const timer = window.setTimeout(() => {
      setRishenghuiAccessToken(getStoredRishenghuiAccessToken());
    }, 0);

    return () => window.clearTimeout(timer);
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;

    async function loadOptions() {
      try {
        const options = await requestShipmentOptions();
        if (!cancelled) {
          setShipmentOptions(options);
        }
      } catch (error) {
        if (!cancelled) {
          setShipmentOptions([]);
        }
        messageApi.error(
          error instanceof Error ? error.message : "货件选项加载失败",
        );
      }
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, [messageApi, mounted]);

  function showRishenghuiTokenRequiredModal(
    content?: string,
    pendingAction?: PendingRishenghuiAction,
  ) {
    setRishenghuiAccessToken("");
    clearStoredRishenghuiAccessToken();
    if (pendingAction) {
      pendingRishenghuiActionRef.current = pendingAction;
    }
    modalApi.warning({
      title: "请先获取日升辉Token",
      content: content?.trim() || "当前没有可用的日升辉Token，请先获取Token。",
      okText: "去获取Token",
      onOk: () => setRishenghuiAuthOpen(true),
    });
  }

  function handleRishenghuiTokenSaved(accessToken: string) {
    const token = accessToken.trim();
    setRishenghuiAccessToken(token);
    saveStoredRishenghuiAccessToken(token);
    const pendingAction = pendingRishenghuiActionRef.current;
    pendingRishenghuiActionRef.current = null;

    if (pendingAction) {
      void pendingAction(accessToken);
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
        {modalContextHolder}
        <main className="h-full overflow-auto bg-slate-100 px-6 py-6">
          <section className="mx-auto flex max-w-[1600px] flex-col gap-4">
            {mounted ? (
              <ShipmentTracksTable
                actionRef={tableActionRef}
                rishenghuiAccessToken={rishenghuiAccessToken}
                onRequireRishenghuiToken={showRishenghuiTokenRequiredModal}
                shipmentOptions={shipmentOptions}
              />
            ) : (
              <ShipmentsTableSkeleton />
            )}
          </section>
        </main>
        {mounted ? (
          <RishenghuiAuthModal
            open={rishenghuiAuthOpen}
            onClose={() => setRishenghuiAuthOpen(false)}
            onSaved={handleRishenghuiTokenSaved}
            onGetAccessToken={getRishenghuiAccessToken}
          />
        ) : null}
      </App>
    </ConfigProvider>
  );
}
