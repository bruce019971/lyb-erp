"use client";

import type { ActionType } from "@ant-design/pro-components";
import { ExclamationCircleFilled } from "@ant-design/icons";
import type { FormInstance } from "antd";
import { App as AntApp, ConfigProvider, Modal, Progress, Steps, message } from "antd";
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
  batchCalculateShipmentGoodsValue,
  clearShipmentFileUrls,
  deleteShipmentRecord,
  generateShipmentLogisticsBoxMark,
  generateShipmentSaleasyLogisticsBoxMark,
  generateShipmentRishenghuiOrderInvoice,
  generateShipmentTongtuLogisticsBoxMark,
  generateShipmentTongtuOrderInvoice,
  getRishenghuiAccessToken,
  submitRishenghuiOrderInvoice,
  submitSaleasyLogisticsOrder,
  submitTongtuOrderInvoice,
  updateShipmentDeliveryStatus,
  updateShipmentRelabelStatus,
} from "../_lib/shipments-request";
import ShipmentCreateDrawer from "./shipment-create-drawer";
import ShipmentEditDrawer from "./shipment-edit-drawer";
import RishenghuiAuthModal from "./rishenghui-auth-modal";
import ShipmentsTable from "./shipments-table";
import ShipmentsTableSkeleton from "./shipments-table-skeleton";

type ShipmentsPageProps = {
  embedded?: boolean;
};

type LogisticsOrderStepKey = "invoice" | "order" | "boxMark";

const logisticsOrderSteps: Array<{
  key: LogisticsOrderStepKey;
  title: string;
}> = [
  { key: "invoice", title: "发票生成中" },
  { key: "order", title: "物流下单中" },
  { key: "boxMark", title: "箱唛生成中" },
];

dayjs.locale("zh-cn");

function waitForProgressStep(ms = 300) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function ShipmentsPage({ embedded = false }: ShipmentsPageProps) {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [rishenghuiAuthOpen, setRishenghuiAuthOpen] = useState(false);
  const [rishenghuiAccessToken, setRishenghuiAccessToken] = useState("");
  const [editingRecord, setEditingRecord] = useState<
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
  const [submittingLogisticsOrderId, setSubmittingLogisticsOrderId] =
    useState<string | null>(null);
  const [logisticsOrderProgress, setLogisticsOrderProgress] = useState<{
    open: boolean;
    providerName: string;
    shipmentNo: string;
    step: LogisticsOrderStepKey;
  }>({
    open: false,
    providerName: "",
    shipmentNo: "",
    step: "invoice",
  });
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
    const productName = searchParams.get("product_name")?.trim();

    if (!shipmentNo && !productName) {
      return;
    }

    searchFormRef.current?.setFieldsValue({
      shipment_no: shipmentNo ? [shipmentNo] : undefined,
      product_name: productName ? [productName] : undefined,
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

  function isSubmittingLogisticsOrder(record: ShipmentRecord) {
    return submittingLogisticsOrderId === record.id;
  }

  function getLogisticsOrderVisibleSteps() {
    if (logisticsOrderProgress.providerName === "赛易") {
      return logisticsOrderSteps.filter((item) => item.key !== "invoice");
    }

    return logisticsOrderSteps;
  }

  function getLogisticsOrderProgressCurrent() {
    const visibleSteps = getLogisticsOrderVisibleSteps();

    return Math.max(
      0,
      visibleSteps.findIndex(
        (item) => item.key === logisticsOrderProgress.step,
      ),
    );
  }

  function getLogisticsOrderProgressPercent() {
    const visibleSteps = getLogisticsOrderVisibleSteps();

    if (!visibleSteps.length) return 0;

    return Math.round(
      ((getLogisticsOrderProgressCurrent() + 1) / visibleSteps.length) * 100,
    );
  }

  function showRishenghuiTokenRequiredModal(content?: string) {
    setRishenghuiAccessToken("");
    modalApi.warning({
      title: "请先获取日升辉Token",
      content: content?.trim() || "当前没有可用的日升辉Token，请先在列表右上角获取Token。",
      okText: "去获取Token",
      onOk: () => setRishenghuiAuthOpen(true),
    });
  }

  function isRishenghuiTokenError(error: unknown) {
    const message = error instanceof Error ? error.message : "";
    return /token|access.?token|authorization|unauthorized|401|403|登录|认证|过期|失效|无效|未授权|权限|身份/i.test(
      message,
    );
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

  function handleClearShipmentFiles(
    ids: string[],
    field: "carton_label_url" | "logistics_box_mark_url",
  ) {
    const label = field === "carton_label_url" ? "外箱标签" : "物流箱唛";

    if (!ids.length) {
      messageApi.warning("请先选择需要处理的货件");
      return;
    }

    modalApi.confirm({
      title: `删除${label}`,
      icon: <ExclamationCircleFilled className="!text-amber-500" />,
      content: `确定删除已选择 ${ids.length} 个货件的${label}吗？`,
      okText: "确定删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      centered: true,
      onOk: async () => {
        try {
          const result = await clearShipmentFileUrls(ids, field);
          messageApi.success(
            `${label}删除成功，已处理 ${result.count ?? ids.length} 个货件`,
          );
          tableActionRef.current?.reload();
        } catch (error) {
          const description =
            error instanceof Error ? error.message : "请检查数据库权限或字段内容";
          messageApi.error(`${label}删除失败：${description}`);
          throw error;
        }
      },
    });
  }

  function handleBatchCalculateGoodsValue(ids: string[]) {
    if (!ids.length) {
      messageApi.warning("请先选择需要处理的货件");
      return;
    }

    modalApi.confirm({
      title: "计算货物价值",
      icon: <ExclamationCircleFilled className="!text-amber-500" />,
      content: `确定重新计算已选择 ${ids.length} 个货件的货物价值吗？`,
      okText: "确定计算",
      cancelText: "取消",
      centered: true,
      onOk: async () => {
        try {
          const result = await batchCalculateShipmentGoodsValue(ids);
          const failedText = result.failureCount
            ? `，失败 ${result.failureCount} 个`
            : "";

          messageApi.success(
            `货物价值计算完成：成功 ${result.successCount} 个${failedText}`,
          );

          if (result.failures.length > 0) {
            Modal.warning({
              title: "部分货件计算失败",
              content: (
                <div className="max-h-60 overflow-auto">
                  {result.failures.map((item) => (
                    <div key={item.shipmentNo}>
                      {item.shipmentNo}：{item.error}
                    </div>
                  ))}
                </div>
              ),
            });
          }

          tableActionRef.current?.reload();
        } catch (error) {
          const description =
            error instanceof Error ? error.message : "请检查数据库权限或字段内容";
          messageApi.error(`货物价值计算失败：${description}`);
          throw error;
        }
      },
    });
  }

  async function handleGenerateLogisticsBoxMark(values: {
    record: ShipmentRecord;
    accessToken: string;
  }) {
    try {
      setGeneratingLogisticsBoxMarkId(values.record.id);
      await generateShipmentLogisticsBoxMark({
        shipmentId: values.record.id,
        accessToken: values.accessToken,
      });
      messageApi.success(
        `${values.record.tracking_no?.trim() || ""}箱唛生成成功`,
      );
      tableActionRef.current?.reload();
    } catch (error) {
      showRishenghuiTokenRequiredModal(
        error instanceof Error ? error.message : "请重新获取日升辉Token后再操作",
      );
      messageApi.error(
        error instanceof Error ? error.message : "物流箱唛生成失败",
      );
    } finally {
      setGeneratingLogisticsBoxMarkId(null);
    }
  }

  async function handleGenerateTongtuLogisticsBoxMark(record: ShipmentRecord) {
    try {
      setGeneratingLogisticsBoxMarkId(record.id);
      const result = await generateShipmentTongtuLogisticsBoxMark({
        shipmentId: record.id,
      });
      messageApi.success(
        `${result.trackingNo || record.tracking_no?.trim() || ""}箱唛生成成功`,
      );
      tableActionRef.current?.reload();
    } catch (error) {
      messageApi.error(
        error instanceof Error ? error.message : "通途物流箱唛生成失败",
      );
    } finally {
      setGeneratingLogisticsBoxMarkId(null);
    }
  }

  async function handleGenerateSaleasyLogisticsBoxMark(record: ShipmentRecord) {
    try {
      setGeneratingLogisticsBoxMarkId(record.id);
      const result = await generateShipmentSaleasyLogisticsBoxMark({
        shipmentId: record.id,
      });
      messageApi.success(
        `${result.trackingNo || record.tracking_no?.trim() || ""}箱唛生成成功`,
      );
      tableActionRef.current?.reload();
    } catch (error) {
      messageApi.error(
        error instanceof Error ? error.message : "赛易物流箱唛生成失败",
      );
    } finally {
      setGeneratingLogisticsBoxMarkId(null);
    }
  }

  async function runLogisticsOrder(record: ShipmentRecord) {
    const providerName = record.logistics_provider?.trim() || "";
    const shipmentNo = record.shipment_no?.trim() || "";
    const isRishenghui = providerName === "日升辉";
    const isTongtu = providerName === "通途";
    const isSaleasy = providerName === "赛易";

    if (!isRishenghui && !isTongtu && !isSaleasy) {
      return;
    }

    const token = rishenghuiAccessToken.trim();
    if (isRishenghui && !token) {
      showRishenghuiTokenRequiredModal();
      return;
    }

    try {
      setSubmittingLogisticsOrderId(record.id);
      setLogisticsOrderProgress({
        open: true,
        providerName,
        shipmentNo,
        step: isSaleasy ? "order" : "invoice",
      });

      if (isSaleasy) {
        const orderResult = await submitSaleasyLogisticsOrder({
          shipmentId: record.id,
        });
        tableActionRef.current?.reload();

        setLogisticsOrderProgress({
          open: true,
          providerName,
          shipmentNo,
          step: "boxMark",
        });
        await waitForProgressStep();
        messageApi.success(
          orderResult.packno
            ? `${orderResult.packno}物流下单成功，箱唛已生成`
            : "赛易物流下单成功，箱唛已生成",
        );
        tableActionRef.current?.reload();
        return;
      }

      const invoiceResult = await (isTongtu
        ? generateShipmentTongtuOrderInvoice
        : generateShipmentRishenghuiOrderInvoice)({
        shipmentId: record.id,
        shipmentNo: record.shipment_no,
      });
      tableActionRef.current?.reload();

      setLogisticsOrderProgress({
        open: true,
        providerName,
        shipmentNo,
        step: "order",
      });
      const orderResult = isTongtu
        ? await submitTongtuOrderInvoice({
            shipmentId: record.id,
          })
        : await submitRishenghuiOrderInvoice({
            shipmentId: record.id,
            fileUrl: invoiceResult.fileUrl,
            fileName: invoiceResult.fileName,
            accessToken: token,
          });
      tableActionRef.current?.reload();

      setLogisticsOrderProgress({
        open: true,
        providerName,
        shipmentNo,
        step: "boxMark",
      });
      const boxMarkResult = isTongtu
        ? await generateShipmentTongtuLogisticsBoxMark({
            shipmentId: record.id,
          })
        : {
            record: await generateShipmentLogisticsBoxMark({
              shipmentId: record.id,
              accessToken: token,
            }),
            trackingNo: "",
          };
      const trackingNo =
        boxMarkResult.trackingNo ||
        orderResult.packno ||
        boxMarkResult.record?.tracking_no?.trim() ||
        "";

      messageApi.success(
        trackingNo
          ? `${trackingNo}物流下单成功，箱唛已生成`
          : `${providerName}物流下单成功，箱唛已生成`,
      );
      tableActionRef.current?.reload();
    } catch (error) {
      const description =
        error instanceof Error ? error.message : `${providerName}物流下单失败`;
      messageApi.error(description);

      if (isRishenghui && isRishenghuiTokenError(error)) {
        showRishenghuiTokenRequiredModal(description);
      }
    } finally {
      setLogisticsOrderProgress((previous) => ({
        ...previous,
        open: false,
      }));
      setSubmittingLogisticsOrderId(null);
    }
  }

  function handleLogisticsOrder(record: ShipmentRecord) {
    const providerName = record.logistics_provider?.trim() || "";

    if (providerName === "日升辉" && !rishenghuiAccessToken.trim()) {
      showRishenghuiTokenRequiredModal();
      return;
    }

    modalApi.confirm({
      title: "是否确认下单",
      icon: <ExclamationCircleFilled className="!text-amber-500" />,
      content: `确认对货件 ${record.shipment_no?.trim() || record.id} 执行${providerName || "物流"}下单吗？`,
      okText: "确认",
      cancelText: "取消",
      centered: true,
      onOk: () => {
        void runLogisticsOrder(record);
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
                onBatchCalculateGoodsValue={handleBatchCalculateGoodsValue}
                onClearCartonLabels={(ids) =>
                  handleClearShipmentFiles(ids, "carton_label_url")
                }
                onClearLogisticsBoxMarks={(ids) =>
                  handleClearShipmentFiles(ids, "logistics_box_mark_url")
                }
                onOpenRishenghuiAuth={() => setRishenghuiAuthOpen(true)}
                hasRishenghuiAccessToken={Boolean(rishenghuiAccessToken)}
                onGenerateLogisticsBoxMark={(record) => {
                  if (record.logistics_provider?.trim() === "通途") {
                    void handleGenerateTongtuLogisticsBoxMark(record);
                    return;
                  }

                  if (record.logistics_provider?.trim() === "赛易") {
                    void handleGenerateSaleasyLogisticsBoxMark(record);
                    return;
                  }

                  const token = rishenghuiAccessToken.trim();
                  if (!token) {
                    Modal.warning({
                      title: "请先获取日升辉Token",
                      content:
                        "当前没有可用的日升辉Token，请先在列表右上角获取Token。",
                      okText: "去获取Token",
                      onOk: () => setRishenghuiAuthOpen(true),
                    });
                    return;
                  }

                  void handleGenerateLogisticsBoxMark({
                    record,
                    accessToken: token,
                  });
                }}
                onLogisticsOrder={(record) => {
                  handleLogisticsOrder(record);
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
                isSubmittingLogisticsOrder={isSubmittingLogisticsOrder}
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
          <Modal
            open={logisticsOrderProgress.open}
            title={`${logisticsOrderProgress.providerName || "物流"}物流下单`}
            footer={null}
            closable={false}
            maskClosable={false}
            centered
          >
            <div className="flex flex-col gap-4 py-2">
              {logisticsOrderProgress.shipmentNo ? (
                <div className="text-sm text-slate-500">
                  货件号：{logisticsOrderProgress.shipmentNo}
                </div>
              ) : null}
              <Steps
                direction="vertical"
                current={getLogisticsOrderProgressCurrent()}
                items={getLogisticsOrderVisibleSteps().map((item) => ({
                  title: item.title,
                }))}
              />
              <Progress
                percent={getLogisticsOrderProgressPercent()}
                showInfo={false}
              />
            </div>
          </Modal>
        ) : null}
        {mounted ? (
          <RishenghuiAuthModal
            open={rishenghuiAuthOpen}
            onClose={() => setRishenghuiAuthOpen(false)}
            onSaved={setRishenghuiAccessToken}
            onGetAccessToken={getRishenghuiAccessToken}
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
            key={editingRecord?.id ?? "shipment-edit-closed"}
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
