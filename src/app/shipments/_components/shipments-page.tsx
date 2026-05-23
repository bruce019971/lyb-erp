"use client";

import type { ActionType } from "@ant-design/pro-components";
import { ExclamationCircleFilled } from "@ant-design/icons";
import type { FormInstance } from "antd";
import { App as AntApp, ConfigProvider, Modal, message } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { ShipmentRecord } from "../_lib/shipments";
import type { ProductShipmentOption } from "../../products/_lib/products";
import { requestProductShipmentOptions } from "../../products/_lib/products-request";
import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import { requestLogisticsProviderOptions } from "../../logistics/_lib/logistics-request";
import type { StoreOption } from "../../stores/_lib/stores";
import { requestStoreOptions } from "../../stores/_lib/stores-request";
import {
  deleteShipmentRecord,
  generateShipmentLogisticsBoxMark,
  generateShipmentRishenghuiOrderInvoice,
  getRishenghuiAccessToken,
  submitRishenghuiOrderInvoice,
  updateShipmentDeliveryStatus,
  updateShipmentRelabelStatus,
} from "../_lib/shipments-request";
import ShipmentCreateDrawer from "./shipment-create-drawer";
import ShipmentEditDrawer from "./shipment-edit-drawer";
import ShipmentBatchCartonLabelModal from "./shipment-batch-carton-label-modal";
import ShipmentLogisticsBoxMarkModal from "./shipment-logistics-box-mark-modal";
import ShipmentRishenghuiOrderModal from "./shipment-rishenghui-order-modal";
import ShipmentsTable from "./shipments-table";
import ShipmentsTableSkeleton from "./shipments-table-skeleton";

type ShipmentsPageProps = {
  embedded?: boolean;
};

dayjs.locale("zh-cn");

export default function ShipmentsPage({ embedded = false }: ShipmentsPageProps) {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [batchCartonLabelOpen, setBatchCartonLabelOpen] = useState(false);
  const [selectedShipmentNos, setSelectedShipmentNos] = useState<string[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [logisticsBoxMarkOpen, setLogisticsBoxMarkOpen] = useState(false);
  const [rishenghuiOrderOpen, setRishenghuiOrderOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<
    ShipmentRecord | undefined
  >(undefined);
  const [logisticsBoxMarkRecord, setLogisticsBoxMarkRecord] = useState<
    ShipmentRecord | undefined
  >(undefined);
  const [rishenghuiOrderRecord, setRishenghuiOrderRecord] = useState<
    ShipmentRecord | undefined
  >(undefined);
  const [deletingShipmentId, setDeletingShipmentId] = useState<string | null>(null);
  const [editingDeliveryStatusId, setEditingDeliveryStatusId] = useState<
    string | null
  >(null);
  const [editingRelabelId, setEditingRelabelId] = useState<string | null>(null);
  const [updatingDeliveryStatusId, setUpdatingDeliveryStatusId] = useState<
    string | null
  >(null);
  const [updatingRelabelId, setUpdatingRelabelId] = useState<string | null>(null);
  const [generatingCartonLabelId, setGeneratingCartonLabelId] = useState<
    string | null
  >(null);
  const [generatingLogisticsBoxMarkId, setGeneratingLogisticsBoxMarkId] =
    useState<string | null>(null);
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [productOptions, setProductOptions] = useState<ProductShipmentOption[]>(
    [],
  );
  const [logisticsOptions, setLogisticsOptions] = useState<
    LogisticsProviderOption[]
  >([]);
  const [messageApi, contextHolder] = message.useMessage();
  const [modalApi, modalContextHolder] = Modal.useModal();
  const tableActionRef = useRef<ActionType>(undefined);
  const searchFormRef = useRef<FormInstance>(undefined);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;

    async function loadOptions() {
      const [storesResult, productsResult, logisticsResult] =
        await Promise.allSettled([
          requestStoreOptions(),
          requestProductShipmentOptions(),
          requestLogisticsProviderOptions(),
        ]);

      if (!cancelled) {
        setStoreOptions(
          storesResult.status === "fulfilled"
            ? storesResult.value.filter((item) => item.seller_name?.trim())
            : [],
        );
        setProductOptions(
          productsResult.status === "fulfilled"
            ? productsResult.value.filter((item) => item.product_name?.trim())
            : [],
        );
        setLogisticsOptions(
          logisticsResult.status === "fulfilled"
            ? logisticsResult.value.filter((item) => item.provider_name?.trim())
            : [],
        );
      }
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;

    const shipmentNo = searchParams.get("shipment_no")?.trim();

    if (!shipmentNo) {
      return;
    }

    searchFormRef.current?.setFieldsValue({
      shipment_no: shipmentNo,
    });
    searchFormRef.current?.submit?.();
  }, [mounted, searchParams]);

  function isDeleting(record: ShipmentRecord) {
    return deletingShipmentId === record.id;
  }

  function isDeliveryStatusEditing(record: ShipmentRecord) {
    return editingDeliveryStatusId === record.id;
  }

  function isDeliveryStatusUpdating(record: ShipmentRecord) {
    return updatingDeliveryStatusId === record.id;
  }

  function isRelabelUpdating(record: ShipmentRecord) {
    return updatingRelabelId === record.id;
  }

  function isRelabelEditing(record: ShipmentRecord) {
    return editingRelabelId === record.id;
  }

  function isGeneratingCartonLabel(record: ShipmentRecord) {
    return generatingCartonLabelId === record.id;
  }

  function isGeneratingLogisticsBoxMark(record: ShipmentRecord) {
    return generatingLogisticsBoxMarkId === record.id;
  }

  async function handleChangeDeliveryStatus(
    record: ShipmentRecord,
    value: string,
  ) {
    if ((record.delivery_status ?? "否") === value) {
      setEditingDeliveryStatusId(null);
      return;
    }

    try {
      setUpdatingDeliveryStatusId(record.id);
      await updateShipmentDeliveryStatus(record, value);
      messageApi.success("是否送仓已更新");
      setEditingDeliveryStatusId(null);
      tableActionRef.current?.reload();
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "请检查数据库权限或记录状态";
      messageApi.error(`状态更新失败：${description}`);
    } finally {
      setUpdatingDeliveryStatusId(null);
    }
  }

  async function handleChangeRelabel(record: ShipmentRecord, value: string) {
    if ((record.is_relabel ?? "") === value) {
      setEditingRelabelId(null);
      return;
    }

    try {
      setUpdatingRelabelId(record.id);
      await updateShipmentRelabelStatus(record, value);
      messageApi.success("是否换标已更新");
      setEditingRelabelId(null);
      tableActionRef.current?.reload();
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "请检查数据库权限或字段内容";
      messageApi.error(`换标状态更新失败：${description}`);
    } finally {
      setUpdatingRelabelId(null);
    }
  }

  function handleDelete(record: ShipmentRecord) {
    modalApi.confirm({
      title: "提示",
      icon: <ExclamationCircleFilled className="!text-amber-500" />,
      content: "此操作将永久删除该货件，是否继续？",
      okText: "确定",
      cancelText: "取消",
      centered: true,
      onOk: async () => {
        try {
          setDeletingShipmentId(record.id);
          await deleteShipmentRecord(record.id);
          messageApi.success("货件删除成功");
          tableActionRef.current?.reload();
        } catch (error) {
          const description =
            error instanceof Error ? error.message : "请检查数据库权限或字段内容";
          messageApi.error(`货件删除失败：${description}`);
          throw error;
        } finally {
          setDeletingShipmentId(null);
        }
      },
    });
  }

  async function handleGenerateLogisticsBoxMark(values: {
    record: ShipmentRecord;
    username: string;
    password: string;
    code: string;
    uuid: string;
  }) {
    try {
      setGeneratingLogisticsBoxMarkId(values.record.id);
      await generateShipmentLogisticsBoxMark({
        shipmentId: values.record.id,
        username: values.username,
        password: values.password,
        code: values.code,
        uuid: values.uuid,
      });
      messageApi.success(
        `${values.record.tracking_no?.trim() || ""}箱唛生成成功`,
      );
      tableActionRef.current?.reload();
    } catch (error) {
      messageApi.error(
        error instanceof Error ? error.message : "物流箱唛生成失败",
      );
    } finally {
      setGeneratingLogisticsBoxMarkId(null);
    }
  }

  async function handleGenerateRishenghuiOrderInvoice(values: {
    record: ShipmentRecord;
  }) {
    const result = await generateShipmentRishenghuiOrderInvoice({
      shipmentId: values.record.id,
      shipmentNo: values.record.shipment_no,
    });
    setRishenghuiOrderRecord(result.record ?? values.record);
    tableActionRef.current?.reload();
    return result;
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
      <AntApp>
        {contextHolder}
        {modalContextHolder}
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
                formRef={searchFormRef}
                onCreate={() => setCreateOpen(true)}
                onBatchCartonLabels={() => setBatchCartonLabelOpen(true)}
                onSelectedShipmentNosChange={setSelectedShipmentNos}
                onGenerateLogisticsBoxMark={(record) => {
                  setLogisticsBoxMarkRecord(record);
                  setLogisticsBoxMarkOpen(true);
                }}
                onRishenghuiOrder={(record) => {
                  setRishenghuiOrderRecord(record);
                  setRishenghuiOrderOpen(true);
                }}
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
                  void handleChangeDeliveryStatus(record, value)
                }
                onStartRelabelEdit={(record) => setEditingRelabelId(record.id)}
                onCancelRelabelEdit={() => setEditingRelabelId(null)}
                onChangeRelabel={(record, value) =>
                  void handleChangeRelabel(record, value)
                }
                isDeliveryStatusEditing={isDeliveryStatusEditing}
                isDeliveryStatusUpdating={isDeliveryStatusUpdating}
                isRelabelEditing={isRelabelEditing}
                isRelabelUpdating={isRelabelUpdating}
                isDeleting={isDeleting}
                isGeneratingCartonLabel={isGeneratingCartonLabel}
                isGeneratingLogisticsBoxMark={isGeneratingLogisticsBoxMark}
                onStartGenerateCartonLabel={(record) =>
                  setGeneratingCartonLabelId(record.id)
                }
                onFinishGenerateCartonLabel={() =>
                  setGeneratingCartonLabelId(null)
                }
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
          <ShipmentRishenghuiOrderModal
            key={
              rishenghuiOrderRecord
                ? `rishenghui-order-${rishenghuiOrderRecord.id}`
                : "rishenghui-order-closed"
            }
            open={rishenghuiOrderOpen}
            record={rishenghuiOrderRecord}
            onClose={() => {
              setRishenghuiOrderOpen(false);
              setRishenghuiOrderRecord(undefined);
            }}
            onGenerateInvoice={handleGenerateRishenghuiOrderInvoice}
            onGetAccessToken={getRishenghuiAccessToken}
            onSubmitOrder={submitRishenghuiOrderInvoice}
            onSubmitSuccess={(record) => {
              if (record) {
                setRishenghuiOrderRecord(record);
              }
              tableActionRef.current?.reload();
            }}
          />
        ) : null}
        {mounted ? (
          <ShipmentLogisticsBoxMarkModal
            key={
              logisticsBoxMarkRecord
                ? `logistics-box-mark-${logisticsBoxMarkRecord.id}`
                : "logistics-box-mark-closed"
            }
            open={logisticsBoxMarkOpen}
            record={logisticsBoxMarkRecord}
            logisticsOptions={logisticsOptions}
            onClose={() => {
              setLogisticsBoxMarkOpen(false);
              setLogisticsBoxMarkRecord(undefined);
            }}
            onGenerate={(values) => void handleGenerateLogisticsBoxMark(values)}
          />
        ) : null}
        {mounted ? (
          <ShipmentBatchCartonLabelModal
            key={
              batchCartonLabelOpen
                ? `batch-carton-label-${selectedShipmentNos.join("|")}`
                : "batch-carton-label-closed"
            }
            open={batchCartonLabelOpen}
            initialShipmentNos={selectedShipmentNos}
            onClose={() => setBatchCartonLabelOpen(false)}
            onFinished={() => {
              tableActionRef.current?.reload();
            }}
          />
        ) : null}
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
