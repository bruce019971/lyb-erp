"use client";

import type { ActionType } from "@ant-design/pro-components";
import { App, ConfigProvider, Modal, Table, message } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useEffect, useRef, useState } from "react";

import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import { requestLogisticsProviderOptions } from "../../logistics/_lib/logistics-request";
import type { ShipmentOption } from "../../shipments/_lib/shipments";
import { requestShipmentOptions } from "../../shipments/_lib/shipments-request";
import { getRishenghuiAccessToken } from "../../shipments/_lib/shipments-request";
import ShipmentsTableSkeleton from "../../shipments/_components/shipments-table-skeleton";
import RishenghuiAuthModal from "../../shipments/_components/rishenghui-auth-modal";
import type { FreightRecord } from "../_lib/freights";
import {
  fetchRishenghuiFreightBill,
  fetchRishenghuiFreightVolume,
  fetchSaleasyFreightBill,
  fetchSaleasyFreightVolume,
  fetchTongtuFreightVolume,
  type FreightVolumeBox,
  updateFreightRecord,
} from "../_lib/freights-request";
import FreightsEditDrawer from "./freights-edit-drawer";
import FreightsTable from "./freights-table";

dayjs.locale("zh-cn");

export default function FreightsPage() {
  const [mounted, setMounted] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [rishenghuiAuthOpen, setRishenghuiAuthOpen] = useState(false);
  const [rishenghuiAccessToken, setRishenghuiAccessToken] = useState("");
  const [editingRecord, setEditingRecord] = useState<FreightRecord | undefined>(
    undefined,
  );
  const [fetchingVolumeId, setFetchingVolumeId] = useState<string | null>(null);
  const [fetchingBillId, setFetchingBillId] = useState<string | null>(null);
  const [editingPaidStatusId, setEditingPaidStatusId] = useState<string | null>(
    null,
  );
  const [updatingPaidStatusId, setUpdatingPaidStatusId] = useState<string | null>(
    null,
  );
  const [volumeDetail, setVolumeDetail] = useState<{
    open: boolean;
    providerName: string;
    record: FreightRecord | null;
    shipmentNo: string;
    trackingNo: string;
    volume: number | null;
    matchedCount: number;
    boxes: FreightVolumeBox[];
  }>({
    open: false,
    providerName: "",
    record: null,
    shipmentNo: "",
    trackingNo: "",
    volume: null,
    matchedCount: 0,
    boxes: [],
  });
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

  function showRishenghuiTokenRequiredModal(content?: string) {
    setRishenghuiAccessToken("");
    modalApi.warning({
      title: "请先获取日升辉Token",
      content: content?.trim() || "当前没有可用的日升辉Token，请先获取Token。",
      okText: "去获取Token",
      onOk: () => setRishenghuiAuthOpen(true),
    });
  }

  function isRishenghuiTokenError(error: unknown) {
    const description = error instanceof Error ? error.message : "";
    return /token|access.?token|authorization|unauthorized|401|403|登录|认证|过期|失效|无效|未授权|权限|身份/i.test(
      description,
    );
  }

  function hasBillAmount(record: FreightRecord) {
    return (
      typeof record.bill_amount === "number" &&
      Number.isFinite(record.bill_amount)
    );
  }

  function isPaidStatusEditing(record: FreightRecord) {
    return editingPaidStatusId === record.id;
  }

  function isPaidStatusUpdating(record: FreightRecord) {
    return updatingPaidStatusId === record.id;
  }

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
    if (hasBillAmount(record)) {
      messageApi.warning("账单金额已存在，不能计算运费");
      return;
    }

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

  function showBillResultModal(params: {
    record: FreightRecord;
    billAmount: number;
    totalFee?: number;
    isConsistent: boolean;
  }) {
    modalApi.info({
      title: params.isConsistent ? "账单金额一致" : "账单金额与总费用不一致",
      content: (
        <div className="space-y-2">
          <div>
            <span className="text-slate-500">货件号：</span>
            {params.record.shipment_no || "-"}
          </div>
          <div>
            <span className="text-slate-500">运单编号：</span>
            {params.record.tracking_no || "-"}
          </div>
          <div>
            <span className="text-slate-500">总费用：</span>
            {params.totalFee ?? params.record.total_fee ?? "-"}
          </div>
          <div>
            <span className="text-slate-500">账单金额：</span>
            <span className="font-semibold text-red-600">
              {params.billAmount}
            </span>
          </div>
        </div>
      ),
      okText: "确定",
      centered: true,
    });
  }

  async function fetchAndSaveBill(record: FreightRecord, providerName: string) {
    try {
      setFetchingBillId(record.id);
      const result =
        providerName === "日升辉"
          ? await fetchRishenghuiFreightBill({
              freightId: record.id,
              accessToken: getRequiredRishenghuiAccessToken(),
            })
          : await fetchSaleasyFreightBill({
              freightId: record.id,
            });

      showBillResultModal({
        record,
        billAmount: result.billAmount,
        totalFee: result.totalFee,
        isConsistent: result.isConsistent,
      });
      tableActionRef.current?.reload();
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "日升辉账单获取失败";
      messageApi.error(`账单获取失败：${description}`);

      if (isRishenghuiTokenError(error)) {
        showRishenghuiTokenRequiredModal(description);
      }
    } finally {
      setFetchingBillId(null);
    }
  }

  function handleFetchBill(record: FreightRecord) {
    const providerName = record.logistics_provider?.trim();

    if (typeof record.total_fee !== "number" || !Number.isFinite(record.total_fee)) {
      messageApi.warning("当前货件总费用为空，不能获取账单");
      return;
    }

    if (providerName !== "日升辉" && providerName !== "赛易") {
      messageApi.warning("当前仅日升辉/赛易货件支持获取账单");
      return;
    }

    if (!record.tracking_no?.trim()) {
      messageApi.warning("当前货件缺少运单编号");
      return;
    }

    if (providerName === "日升辉" && !rishenghuiAccessToken.trim()) {
      showRishenghuiTokenRequiredModal();
      return;
    }

    if (typeof record.bill_amount === "number" && Number.isFinite(record.bill_amount)) {
      modalApi.confirm({
        title: "是否覆盖账单金额？",
        content: `当前账单金额已有值 ${record.bill_amount}，是否重新获取并覆盖？`,
        okText: "覆盖",
        cancelText: "取消",
        centered: true,
        onOk: () => fetchAndSaveBill(record, providerName),
      });
      return;
    }

    void fetchAndSaveBill(record, providerName);
  }

  async function handleChangePaidStatus(record: FreightRecord, value: string) {
    const nextValue = value.trim() === "是" ? "是" : "否";

    async function savePaidStatus() {
      try {
        setUpdatingPaidStatusId(record.id);
        await updateFreightRecord(record.id, {
          freight_unit_price: record.freight_unit_price,
          volume: record.volume,
          extra_fee: record.extra_fee,
          total_fee: record.total_fee,
          freight_paid_status: nextValue,
        });
        messageApi.success(
          nextValue === "是" ? "支付状态已确认" : "是否支付已更新",
        );
        setEditingPaidStatusId(null);
        tableActionRef.current?.reload();
      } catch (error) {
        const description =
          error instanceof Error ? error.message : "请检查数据库权限或字段内容";
        messageApi.error(`是否支付更新失败：${description}`);
      } finally {
        setUpdatingPaidStatusId(null);
      }
    }

    if (!hasBillAmount(record)) {
      messageApi.warning("账单金额为空时不能更改是否支付");
      setEditingPaidStatusId(null);
      return;
    }

    if ((record.freight_paid_status ?? "否") === nextValue) {
      setEditingPaidStatusId(null);
      return;
    }

    if (record.freight_paid_status === "是") {
      messageApi.warning("已支付状态不可更改");
      setEditingPaidStatusId(null);
      return;
    }

    if (nextValue === "是") {
      modalApi.confirm({
        title: "确认支付？",
        content: "选择是后将标记为已支付，状态不可逆，是否确认？",
        okText: "确认支付",
        cancelText: "取消",
        centered: true,
        onOk: savePaidStatus,
        onCancel: () => setEditingPaidStatusId(null),
      });
      return;
    }

    await savePaidStatus();
  }

  async function fetchAndSaveVolume(record: FreightRecord) {
    const providerName = record.logistics_provider?.trim();

    try {
      setFetchingVolumeId(record.id);

      if (providerName === "日升辉") {
        const result = await fetchRishenghuiFreightVolume({
          freightId: record.id,
          accessToken: getRequiredRishenghuiAccessToken(),
        });

        setVolumeDetail({
          open: true,
          providerName: "日升辉",
          record,
          shipmentNo: record.shipment_no?.trim() || "",
          trackingNo: record.tracking_no?.trim() || "",
          volume: result.volume,
          matchedCount: result.matchedCount,
          boxes: result.boxes ?? [],
        });
      } else if (providerName === "通途") {
        const result = await fetchTongtuFreightVolume({
          freightId: record.id,
        });

        setVolumeDetail({
          open: true,
          providerName: "通途",
          record,
          shipmentNo: record.shipment_no?.trim() || "",
          trackingNo: record.tracking_no?.trim() || "",
          volume: result.volume,
          matchedCount: result.matchedCount,
          boxes: result.boxes ?? [],
        });
      } else {
        const result = await fetchSaleasyFreightVolume({
          freightId: record.id,
        });

        setVolumeDetail({
          open: true,
          providerName: "赛易",
          record,
          shipmentNo: record.shipment_no?.trim() || "",
          trackingNo: record.tracking_no?.trim() || "",
          volume: result.volume,
          matchedCount: result.matchedCount,
          boxes: result.boxes ?? [],
        });
      }
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "方数获取失败";
      messageApi.error(`方数获取失败：${description}`);

      if (providerName === "日升辉" && isRishenghuiTokenError(error)) {
        showRishenghuiTokenRequiredModal(description);
      }
    } finally {
      setFetchingVolumeId(null);
    }
  }

  function getRequiredRishenghuiAccessToken() {
    const token = rishenghuiAccessToken.trim();
    if (!token) {
      throw new Error("请先获取日升辉Token");
    }

    return token;
  }

  function handleFetchVolume(record: FreightRecord) {
    const providerName = record.logistics_provider?.trim();

    if (hasBillAmount(record)) {
      messageApi.warning("账单金额已存在，不能获取方数");
      return;
    }

    if (
      providerName !== "日升辉" &&
      providerName !== "通途" &&
      providerName !== "赛易"
    ) {
      messageApi.warning("仅日升辉/通途/赛易货件可以获取方数");
      return;
    }

    if (providerName === "日升辉" && !record.tracking_no?.trim()) {
      messageApi.warning("当前货件缺少运单编号");
      return;
    }

    if (
      (providerName === "通途" || providerName === "赛易") &&
      !record.shipment_no?.trim()
    ) {
      messageApi.warning("当前货件缺少货件号");
      return;
    }

    if (providerName === "日升辉" && !rishenghuiAccessToken.trim()) {
      showRishenghuiTokenRequiredModal();
      return;
    }

    if (typeof record.volume === "number" && Number.isFinite(record.volume)) {
      modalApi.confirm({
        title: "是否覆盖",
        content: `当前方数已有值 ${record.volume}，是否重新获取并覆盖？`,
        okText: "覆盖",
        cancelText: "取消",
        centered: true,
        onOk: () => fetchAndSaveVolume(record),
      });
      return;
    }

    void fetchAndSaveVolume(record);
  }

  async function handleConfirmVolume() {
    const record = volumeDetail.record;
    const volume = volumeDetail.volume;

    if (!record || typeof volume !== "number" || !Number.isFinite(volume)) {
      messageApi.error("缺少可保存的方数");
      return;
    }

    if (hasBillAmount(record)) {
      messageApi.warning("账单金额已存在，不能填充方数");
      return;
    }

    try {
      setFetchingVolumeId(record.id);
      await updateFreightRecord(record.id, {
        freight_unit_price: record.freight_unit_price,
        volume,
        extra_fee: record.extra_fee,
        total_fee: record.total_fee,
        freight_paid_status: record.freight_paid_status ?? "否",
      });
      messageApi.success("方数已填充到当前货件");
      setVolumeDetail((previous) => ({
        ...previous,
        open: false,
        record: null,
      }));
      tableActionRef.current?.reload();
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "请检查数据库权限或字段内容";
      messageApi.error(`方数保存失败：${description}`);
    } finally {
      setFetchingVolumeId(null);
    }
  }

  function handleCloseVolumeDetail() {
    setVolumeDetail((previous) => ({
      ...previous,
      open: false,
      record: null,
    }));
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
                  if (hasBillAmount(record)) {
                    messageApi.warning("账单金额已存在，不能编辑");
                    return;
                  }

                  setEditingRecord(record);
                  setEditOpen(true);
                }}
                onFetchVolume={handleFetchVolume}
                onFetchBill={handleFetchBill}
                onCalculateFreight={handleCalculateFreight}
                onStartPaidStatusEdit={(record) => {
                  if (!hasBillAmount(record)) {
                    messageApi.warning("账单金额为空时不能更改是否支付");
                    return;
                  }

                  setEditingPaidStatusId(record.id);
                }}
                onCancelPaidStatusEdit={() => setEditingPaidStatusId(null)}
                onChangePaidStatus={(record, value) =>
                  void handleChangePaidStatus(record, value)
                }
                isFetchingVolume={(record) => fetchingVolumeId === record.id}
                isFetchingBill={(record) => fetchingBillId === record.id}
                isCalculatingFreight={(record) =>
                  calculatingFreightId === record.id
                }
                isPaidStatusEditing={isPaidStatusEditing}
                isPaidStatusUpdating={isPaidStatusUpdating}
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
        {mounted ? (
          <RishenghuiAuthModal
            open={rishenghuiAuthOpen}
            onClose={() => setRishenghuiAuthOpen(false)}
            onSaved={setRishenghuiAccessToken}
            onGetAccessToken={getRishenghuiAccessToken}
          />
        ) : null}
        <Modal
          title={`${volumeDetail.providerName || "物流"}方数明细`}
          open={volumeDetail.open}
          width={760}
          centered
          maskClosable={false}
          okText="确定"
          cancelText="取消"
          confirmLoading={
            Boolean(volumeDetail.record) &&
            fetchingVolumeId === volumeDetail.record?.id
          }
          onOk={() => void handleConfirmVolume()}
          onCancel={handleCloseVolumeDetail}
        >
          <div className="mb-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
            <div>
              <span className="text-slate-500">货件号：</span>
              {volumeDetail.shipmentNo || "-"}
            </div>
            <div>
              <span className="text-slate-500">运单编号：</span>
              {volumeDetail.trackingNo || "-"}
            </div>
            <div>
              <span className="text-slate-500">总方数：</span>
              {volumeDetail.volume ?? "-"}
            </div>
          </div>
          <Table<FreightVolumeBox>
            size="small"
            rowKey={(_, index) => `${volumeDetail.providerName}-${volumeDetail.shipmentNo}-${index}`}
            pagination={false}
            dataSource={volumeDetail.boxes}
            scroll={{ y: 360 }}
            columns={[
              {
                title: "序号",
                width: 70,
                render: (_, __, index) => index + 1,
              },
              {
                title: "长(cm)",
                dataIndex: "length",
                render: (value) => value ?? "-",
              },
              {
                title: "宽(cm)",
                dataIndex: "width",
                render: (value) => value ?? "-",
              },
              {
                title: "高(cm)",
                dataIndex: "height",
                render: (value) => value ?? "-",
              },
              {
                title: "计费体积",
                dataIndex: "yjf_weit",
                render: (value) => value ?? "-",
              },
            ]}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4}>
                    匹配箱数：{volumeDetail.matchedCount}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4}>
                    合计：{volumeDetail.volume ?? "-"}
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </Modal>
      </App>
    </ConfigProvider>
  );
}
