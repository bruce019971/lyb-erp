"use client";

import { DownloadOutlined, PlusOutlined } from "@ant-design/icons";
import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import type { FormInstance } from "antd";
import { App, Button, Tooltip, Typography } from "antd";
import type { Key, MutableRefObject } from "react";
import { useState } from "react";

import type { ProductFilterOption, ProductRecord } from "../_lib/products";
import { requestProductRecords, deleteProductRecord } from "../_lib/products-request";
import { getProductColumns } from "./products-columns";

type ProductsTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  formRef?: MutableRefObject<FormInstance | undefined>;
  onCreate: () => void;
  onView: (record: ProductRecord) => void;
  onEdit: (record: ProductRecord) => void;
  productNameOptions: ProductFilterOption[];
  skuOptions: ProductFilterOption[];
  storeNameOptions: ProductFilterOption[];
};

export default function ProductsTable({
  actionRef,
  formRef,
  onCreate,
  onView,
  onEdit,
  productNameOptions,
  skuOptions,
  storeNameOptions,
}: ProductsTableProps) {
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(
    null,
  );
  const [downloadingLabel, setDownloadingLabel] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const { message, modal } = App.useApp();

  function buildLabelFilename(product: ProductRecord) {
    const safePart = (value?: string | null) =>
      value?.trim().replace(/[\\/:*?"<>|]+/g, "_") ?? "";

    const productName = safePart(product.product_name) || "产品";
    const mlCode = safePart(product.ml_code) || "MLCode";
    const storeCode = safePart(product.store_code) || "StoreCode";

    return `${productName}产品标签_${mlCode}_${storeCode}`;
  }

  async function handleDownloadLabel() {
    if (!selectedProduct?.product_label_url) {
      message.error("当前产品未上传产品标签");
      return;
    }

    try {
      setDownloadingLabel(true);
      const response = await fetch(selectedProduct.product_label_url);
      if (!response.ok) {
        throw new Error("标签文件读取失败");
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const suffix =
        selectedProduct.product_label_url.split(".").pop()?.split("?")[0] ?? "";
      const filenameBase = buildLabelFilename(selectedProduct);
      link.href = objectUrl;
      link.download = suffix ? `${filenameBase}.${suffix}` : filenameBase;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "标签下载失败";
      message.error(description);
    } finally {
      setDownloadingLabel(false);
    }
  }

  function handleDelete(record: ProductRecord) {
    modal.confirm({
      title: "确认删除",
      content: `确定要删除产品"${record.product_name ?? "未命名"}"吗？`,
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        try {
          await deleteProductRecord(record.id, record.product_name ?? "");
          message.success("删除成功");
          actionRef?.current?.reload();
        } catch (error) {
          const description =
            error instanceof Error ? error.message : "删除失败";
          message.error(description);
        }
      },
    });
  }

  return (
    <ProTable<ProductRecord>
      actionRef={actionRef}
      formRef={formRef}
      rowKey="id"
      rowSelection={{
        type: "radio",
        selectedRowKeys,
        onChange: (keys, rows) => {
          setSelectedRowKeys(keys);
          setSelectedProduct(rows[0] ?? null);
        },
      }}
      tableAlertRender={false}
      headerTitle={
        <Typography.Text>
          产品数：<Typography.Text strong>{totalCount}</Typography.Text>
        </Typography.Text>
      }
      columns={getProductColumns(
        onView,
        onEdit,
        handleDelete,
        productNameOptions,
        skuOptions,
        storeNameOptions,
      )}
      scroll={{ x: 1900, y: "calc(100vh - 320px)" }}
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
      pagination={false}
      onRow={(record) => ({
        onClick: () => {
          setSelectedRowKeys([record.id]);
          setSelectedProduct(record);
        },
      })}
      toolBarRender={() => {
        const actions = [
          <Tooltip key="create" title="新增产品">
            <Button type="text" icon={<PlusOutlined />} onClick={onCreate} />
          </Tooltip>,
        ];

        if (selectedProduct) {
          actions.push(
            <Tooltip
              key="download-label"
              title={
                selectedProduct.product_label_url
                  ? "下载产品标签"
                  : "当前产品未上传产品标签"
              }
            >
              <Button
                type="text"
                icon={<DownloadOutlined />}
                loading={downloadingLabel}
                disabled={!selectedProduct.product_label_url}
                onClick={handleDownloadLabel}
              />
            </Tooltip>,
          );
        }

        return actions;
      }}
      dateFormatter="string"
      request={async (params, sorter) => {
        const result = await requestProductRecords(params, sorter);
        setTotalCount(result.total);
        return result;
      }}
    />
  );
}
