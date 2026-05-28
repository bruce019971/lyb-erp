"use client";

import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { App, Empty, Modal, Spin, Steps, Typography } from "antd";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ShipmentOption } from "../../shipments/_lib/shipments";
import {
  requestShipmentTrackRecords,
  updateRishenghuiShipmentTrack,
  updateSaleasyShipmentTrack,
} from "../_lib/shipment-tracks-request";
import {
  formatShipmentTrackDateTime,
  type ShipmentTrackRecord,
} from "../_lib/shipment-tracks";
import { getShipmentTrackColumns } from "./shipment-tracks-columns";

type ShipmentTracksTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  shipmentOptions: ShipmentOption[];
  rishenghuiAccessToken: string;
  onRequireRishenghuiToken: (
    content?: string,
    pendingAction?: (accessToken: string) => void | Promise<void>,
  ) => void;
};

const PAGE_SIZE = 40;

function mergeTracksById(
  current: ShipmentTrackRecord[],
  incoming: ShipmentTrackRecord[],
) {
  const merged = new Map<string, ShipmentTrackRecord>();

  current.forEach((item) => {
    merged.set(item.id, item);
  });

  incoming.forEach((item) => {
    merged.set(item.id, item);
  });

  return Array.from(merged.values());
}

export default function ShipmentTracksTable({
  actionRef,
  onRequireRishenghuiToken,
  rishenghuiAccessToken,
  shipmentOptions,
}: ShipmentTracksTableProps) {
  const searchParamsRef = useRef<Record<string, unknown>>({});
  const loadingRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const currentPageRef = useRef(1);
  const [dataSource, setDataSource] = useState<ShipmentTrackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [updatingTrackIds, setUpdatingTrackIds] = useState<string[]>([]);
  const [trackDetailsRecord, setTrackDetailsRecord] =
    useState<ShipmentTrackRecord | null>(null);
  const { message: messageApi } = App.useApp();
  const trackDetailEvents = useMemo(
    () =>
      [...(trackDetailsRecord?.track_events ?? [])].sort((left, right) => {
        const leftTime = left.time ? Date.parse(left.time) : 0;
        const rightTime = right.time ? Date.parse(right.time) : 0;

        return rightTime - leftTime;
      }),
    [trackDetailsRecord],
  );

  const handleOpenTrackDetails = useCallback((record: ShipmentTrackRecord) => {
    setTrackDetailsRecord(record);
  }, []);

  const runUpdateTrack = useCallback(async (
    record: ShipmentTrackRecord,
    token: string,
  ) => {
    setUpdatingTrackIds((current) =>
      current.includes(record.id) ? current : [...current, record.id],
    );

    try {
      const providerName = record.logistics_provider?.trim();
      const result =
        providerName === "日升辉"
          ? await updateRishenghuiShipmentTrack({
              trackId: record.id,
              accessToken: token,
            })
          : await updateSaleasyShipmentTrack({ trackId: record.id });

      setDataSource((current) =>
        current.map((item) =>
          item.id === result.record.id ? result.record : item,
        ),
      );
      messageApi.success(`${record.shipment_no || "货件"}轨迹更新成功`);
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "轨迹更新失败";
      messageApi.error(description);

      if (
        record.logistics_provider?.trim() === "日升辉" &&
        /token|access.?token|authorization|unauthorized|401|403|登录|认证|过期|失效|无效|未授权|权限|身份/i.test(
          description,
        )
      ) {
        onRequireRishenghuiToken(description);
      }
    } finally {
      setUpdatingTrackIds((current) => current.filter((id) => id !== record.id));
    }
  }, [messageApi, onRequireRishenghuiToken]);

  const handleUpdateTrack = useCallback(async (
    record: ShipmentTrackRecord,
    accessTokenOverride?: string,
  ) => {
    const providerName = record.logistics_provider?.trim();
    const token = accessTokenOverride?.trim() || rishenghuiAccessToken.trim();

    if (providerName === "日升辉" && !token) {
      onRequireRishenghuiToken(undefined, (accessToken) =>
        runUpdateTrack(record, accessToken),
      );
      return;
    }

    await runUpdateTrack(record, token);
  }, [onRequireRishenghuiToken, rishenghuiAccessToken, runUpdateTrack]);

  const isUpdatingTrack = useCallback(
    (record: ShipmentTrackRecord) => updatingTrackIds.includes(record.id),
    [updatingTrackIds],
  );

  const columns = useMemo(
    () =>
      getShipmentTrackColumns(
        shipmentOptions,
        handleUpdateTrack,
        handleOpenTrackDetails,
        isUpdatingTrack,
      ),
    [
      handleOpenTrackDetails,
      handleUpdateTrack,
      isUpdatingTrack,
      shipmentOptions,
    ],
  );

  const loadPage = useCallback(
    async (
      page: number,
      params: Record<string, unknown>,
      options?: { append?: boolean },
    ) => {
      const append = options?.append ?? false;

      if (append) {
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        loadingRef.current = true;
        setLoading(true);
      }

      try {
        const result = await requestShipmentTrackRecords({
          ...params,
          current: page,
          pageSize: PAGE_SIZE,
        });
        const nextData = result.data ?? [];

        setDataSource((current) =>
          append ? mergeTracksById(current, nextData) : nextData,
        );
        currentPageRef.current = page;
        hasMoreRef.current = nextData.length >= PAGE_SIZE;
      } finally {
        loadingRef.current = false;
        loadingMoreRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  const reloadFirstPage = useCallback(async () => {
    await loadPage(1, searchParamsRef.current, { append: false });
  }, [loadPage]);

  const loadNextPage = useCallback(async () => {
    if (loadingRef.current || loadingMoreRef.current || !hasMoreRef.current) {
      return;
    }

    await loadPage(currentPageRef.current + 1, searchParamsRef.current, {
      append: true,
    });
  }, [loadPage]);

  useEffect(() => {
    void reloadFirstPage();
  }, [reloadFirstPage]);

  useEffect(() => {
    if (!actionRef) return;

    actionRef.current = {
      reload: () => {
        void reloadFirstPage();
      },
      reloadAndRest: () => {
        searchParamsRef.current = {};
        void loadPage(1, {}, { append: false });
      },
    } as ActionType;

    return () => {
      actionRef.current = undefined;
    };
  }, [actionRef, loadPage, reloadFirstPage]);

  return (
    <>
      <ProTable<ShipmentTrackRecord>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={dataSource}
        loading={loading}
        search={{
          labelWidth: "auto",
          defaultCollapsed: false,
        }}
        options={{
          density: false,
          fullScreen: false,
          reload: false,
          setting: true,
        }}
        toolBarRender={false}
        scroll={{ x: 1270 }}
        onScroll={(event) => {
          const target = event.currentTarget;

          if (
            target.scrollTop + target.clientHeight >=
            target.scrollHeight - 80
          ) {
            void loadNextPage();
          }
        }}
        onSubmit={(values) => {
          searchParamsRef.current = values;
          void loadPage(1, values, { append: false });
        }}
        onReset={() => {
          searchParamsRef.current = {};
          void loadPage(1, {}, { append: false });
        }}
        pagination={false}
        dateFormatter="string"
        tableRender={(_, dom) => (
          <div className="relative">
            {dom}
            {loadingMore ? (
              <div className="flex justify-center py-3 text-slate-400">
                <Spin size="small" />
              </div>
            ) : null}
          </div>
        )}
      />
      <Modal
        title="轨迹详情"
        open={Boolean(trackDetailsRecord)}
        footer={null}
        width={680}
        onCancel={() => setTrackDetailsRecord(null)}
      >
        <div className="mb-4 flex flex-col gap-1">
          <Typography.Text strong>
            {trackDetailsRecord?.shipment_no || "-"}
          </Typography.Text>
          <Typography.Text type="secondary">
            {trackDetailsRecord?.tracking_no || "-"}
          </Typography.Text>
        </div>
        <div className="max-h-[60vh] overflow-y-auto pr-2">
          {trackDetailEvents.length ? (
            <Steps
              progressDot
              direction="vertical"
              current={0}
              items={trackDetailEvents.map((item) => ({
                title: item.time
                  ? formatShipmentTrackDateTime(item.time)
                  : "时间未知",
                description: item.content,
              }))}
            />
          ) : (
            <Empty description="暂无轨迹明细" />
          )}
        </div>
      </Modal>
    </>
  );
}
