"use client";

import { ExclamationCircleFilled } from "@ant-design/icons";
import type { FormInstance } from "antd";
import {
  App as AntApp,
  ConfigProvider,
  Modal,
  message,
} from "antd";
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
  type ShipmentFileUrlField,
  deleteShipmentRecord,
  deleteShipmentRecords,
  ShipmentBatchDeleteRequiresForceError,
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
import {
  clearStoredRishenghuiAccessToken,
  getStoredRishenghuiAccessToken,
  saveStoredRishenghuiAccessToken,
} from "../_lib/rishenghui-token-storage";
import ShipmentCreateDrawer from "./shipment-create-drawer";
import ShipmentEditDrawer from "./shipment-edit-drawer";
import RishenghuiAuthModal from "./rishenghui-auth-modal";
import ShipmentsTable, { type ShipmentsTableAction } from "./shipments-table";
import ShipmentsTableSkeleton from "./shipments-table-skeleton";

type ShipmentsPageProps = {
  embedded?: boolean;
};

type PendingRishenghuiAction = (accessToken: string) => void | Promise<void>;

const LOGISTICS_ORDER_PROVIDER_NAMES = ["日升辉", "通途", "赛易"];

function supportsLogisticsOrder(record: ShipmentRecord) {
  const providerName = record.logistics_provider?.trim();
  return Boolean(
    providerName && LOGISTICS_ORDER_PROVIDER_NAMES.includes(providerName),
  );
}

dayjs.locale("zh-cn");

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
  const [batchDeletingShipments, setBatchDeletingShipments] = useState(false);
  const [batchSubmittingLogisticsOrders, setBatchSubmittingLogisticsOrders] =
    useState(false);
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
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [productOptions, setProductOptions] = useState<ProductShipmentOption[]>(
    [],
  );
  const [logisticsOptions, setLogisticsOptions] = useState<
    LogisticsProviderOption[]
  >([]);
  const [messageApi, contextHolder] = message.useMessage();
  const [modalApi, modalContextHolder] = Modal.useModal();
  const tableActionRef = useRef<ShipmentsTableAction>(undefined);
  const searchFormRef = useRef<FormInstance>(undefined);
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

  function handleBatchDelete(ids: string[]) {
    if (ids.length === 0) {
      messageApi.warning("请先选择需要删除的货件");
      return;
    }

    async function runBatchDelete(force = false) {
      try {
        setBatchDeletingShipments(true);
        await deleteShipmentRecords(ids, { force });
        messageApi.success(force ? "货件已强制删除" : "货件批量删除成功");
        tableActionRef.current?.reload();
      } catch (error) {
        if (!force && error instanceof ShipmentBatchDeleteRequiresForceError) {
          throw error;
        }

        const description =
          error instanceof Error ? error.message : "请检查数据库权限或字段内容";
        messageApi.error(`货件批量删除失败：${description}`);
        throw error;
      } finally {
        setBatchDeletingShipments(false);
      }
    }

    function showForceDeleteConfirm(shipmentNos: string[]) {
      const shipmentNoText = shipmentNos.length
        ? shipmentNos.join("、")
        : "选中货件";

      modalApi.confirm({
        title: "强制删除货件",
        icon: <ExclamationCircleFilled className="!text-red-500" />,
        content: `以下货件已有运单编号：${shipmentNoText}。是否确认强制删除？`,
        okText: "强制删除",
        cancelText: "取消",
        okButtonProps: { danger: true },
        centered: true,
        onOk: async () => {
          await runBatchDelete(true);
        },
      });
    }

    modalApi.confirm({
      title: "提示",
      icon: <ExclamationCircleFilled className="!text-amber-500" />,
      content: `此操作将永久删除选中的 ${ids.length} 个货件，是否继续？`,
      okText: "确定",
      cancelText: "取消",
      centered: true,
      onOk: async () => {
        try {
          await runBatchDelete();
        } catch (error) {
          if (error instanceof ShipmentBatchDeleteRequiresForceError) {
            showForceDeleteConfirm(error.shipmentNos);
            return;
          }

          throw error;
        }
      },
    });
  }

  function getShipmentFileFieldLabel(field: ShipmentFileUrlField) {
    if (field === "carton_label_url") return "外箱标签";
    if (field === "logistics_box_mark_url") return "物流箱唛";
    return "发票";
  }

  function handleClearShipmentFiles(ids: string[], field: ShipmentFileUrlField) {
    const label = getShipmentFileFieldLabel(field);

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
      const description =
        error instanceof Error ? error.message : "物流箱唛生成失败";
      if (isRishenghuiTokenError(error)) {
        showRishenghuiTokenRequiredModal(description, (accessToken) =>
          handleGenerateLogisticsBoxMark({
            record: values.record,
            accessToken,
          }),
        );
      } else {
        messageApi.error(description);
      }
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

  async function submitLogisticsOrder(record: ShipmentRecord, accessToken: string) {
    const providerName = record.logistics_provider?.trim() || "";
    const isRishenghui = providerName === "日升辉";
    const isTongtu = providerName === "通途";
    const isSaleasy = providerName === "赛易";

    if (!isRishenghui && !isTongtu && !isSaleasy) {
      throw new Error("当前仅支持日升辉、通途和赛易物流下单");
    }

    if (record.tracking_no?.trim()) {
      throw new Error("当前货件已存在运单编号，不能重复下单");
    }

    const token = accessToken.trim();
    if (isRishenghui && !token) {
      throw new Error("当前没有可用的日升辉Token");
    }

    if (isSaleasy) {
      const orderResult = await submitSaleasyLogisticsOrder({
        shipmentId: record.id,
      });

      return {
        providerName,
        trackingNo: orderResult.packno,
      };
    }

    const invoiceResult = await (isTongtu
      ? generateShipmentTongtuOrderInvoice
      : generateShipmentRishenghuiOrderInvoice)({
      shipmentId: record.id,
      shipmentNo: record.shipment_no,
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

    return {
      providerName,
      trackingNo:
        boxMarkResult.trackingNo ||
        orderResult.packno ||
        boxMarkResult.record?.tracking_no?.trim() ||
        "",
    };
  }

  async function runLogisticsOrder(
    record: ShipmentRecord,
    accessTokenOverride?: string,
  ) {
    const providerName = record.logistics_provider?.trim() || "";
    const isRishenghui = providerName === "日升辉";

    if (!supportsLogisticsOrder(record)) {
      return;
    }

    const token = accessTokenOverride?.trim() || rishenghuiAccessToken.trim();
    if (isRishenghui && !token) {
      showRishenghuiTokenRequiredModal(undefined, (accessToken) =>
        runLogisticsOrder(record, accessToken),
      );
      return;
    }

    try {
      setSubmittingLogisticsOrderId(record.id);
      const result = await submitLogisticsOrder(record, token);

      messageApi.success(
        result.trackingNo
          ? `${result.trackingNo}物流下单成功，箱唛已生成`
          : `${providerName}物流下单成功，箱唛已生成`,
      );
      tableActionRef.current?.reload();
    } catch (error) {
      const description =
        error instanceof Error ? error.message : `${providerName}物流下单失败`;
      if (isRishenghui && isRishenghuiTokenError(error)) {
        showRishenghuiTokenRequiredModal(description, (accessToken) =>
          runLogisticsOrder(record, accessToken),
        );
      } else {
        messageApi.error(description);
      }
    } finally {
      setSubmittingLogisticsOrderId(null);
    }
  }

  async function handleBatchLogisticsOrder(
    records: ShipmentRecord[],
    accessTokenOverride?: string,
  ) {
    if (!records.length) {
      messageApi.warning("请先选择需要下单的货件");
      return;
    }

    const orderableRecords = records.filter((record) => {
      return !record.tracking_no?.trim() && supportsLogisticsOrder(record);
    });

    if (!orderableRecords.length) {
      messageApi.warning("已选择货件均已下单或物流商不支持下单");
      return;
    }

    const token = accessTokenOverride?.trim() || rishenghuiAccessToken.trim();
    const hasRishenghui = orderableRecords.some(
      (record) => record.logistics_provider?.trim() === "日升辉",
    );

    if (hasRishenghui && !token) {
      showRishenghuiTokenRequiredModal(undefined, (accessToken) =>
        handleBatchLogisticsOrder(records, accessToken),
      );
      return;
    }

    const orderableIdSet = new Set(orderableRecords.map((record) => record.id));
    const failures: Array<{ id: string; shipmentNo: string; error: string }> =
      records
        .filter((record) => !orderableIdSet.has(record.id))
        .map((record) => ({
          id: record.id,
          shipmentNo: record.shipment_no?.trim() || record.id,
          error: record.tracking_no?.trim()
            ? "已有运单编号，不能重复下单"
            : "物流商不支持下单",
        }));
    let successCount = 0;

    try {
      setBatchSubmittingLogisticsOrders(true);

      for (const record of orderableRecords) {
        try {
          setSubmittingLogisticsOrderId(record.id);
          await submitLogisticsOrder(record, token);
          successCount += 1;
        } catch (error) {
          failures.push({
            id: record.id,
            shipmentNo: record.shipment_no?.trim() || record.id,
            error:
              error instanceof Error ? error.message : "物流下单失败",
          });
        }
      }
    } finally {
      setSubmittingLogisticsOrderId(null);
      setBatchSubmittingLogisticsOrders(false);
      tableActionRef.current?.reload();
    }

    if (successCount > 0) {
      messageApi.success(
        `物流批量下单完成：成功 ${successCount} 个${
          failures.length ? `，失败 ${failures.length} 个` : ""
        }`,
      );
    }

    if (failures.length > 0) {
      modalApi.warning({
        title:
          successCount > 0
            ? "部分货件物流下单失败"
            : "货件物流批量下单失败",
        content: (
          <div className="max-h-72 overflow-auto">
            {failures.map((item) => (
              <div key={item.id} className="mb-1">
                {item.shipmentNo}：{item.error}
              </div>
            ))}
          </div>
        ),
      });
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
                onBatchLogisticsOrder={(records) =>
                  void handleBatchLogisticsOrder(records)
                }
                onBatchCalculateGoodsValue={handleBatchCalculateGoodsValue}
                onBatchDelete={handleBatchDelete}
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
                    showRishenghuiTokenRequiredModal(undefined, (accessToken) =>
                      handleGenerateLogisticsBoxMark({
                        record,
                        accessToken,
                      }),
                    );
                    return;
                  }

                  void handleGenerateLogisticsBoxMark({
                    record,
                    accessToken: token,
                  });
                }}
                onLogisticsOrder={(record) => void runLogisticsOrder(record)}
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
                isBatchDeleting={batchDeletingShipments}
                isBatchSubmittingLogisticsOrder={
                  batchSubmittingLogisticsOrders
                }
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
          <RishenghuiAuthModal
            open={rishenghuiAuthOpen}
            onClose={() => setRishenghuiAuthOpen(false)}
            onSaved={handleRishenghuiTokenSaved}
            onGetAccessToken={getRishenghuiAccessToken}
          />
        ) : null}
        {mounted ? (
          <ShipmentCreateDrawer
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            onCreated={(record) => {
              setCreateOpen(false);
              const updatedLocally =
                tableActionRef.current?.prependCreatedRecord(record) ?? false;

              if (!updatedLocally) {
                tableActionRef.current?.reload();
              }
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
