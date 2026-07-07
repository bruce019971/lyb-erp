"use client";

import { CopyOutlined, DownloadOutlined, PlusOutlined } from "@ant-design/icons";
import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import type { FormInstance } from "antd";
import { App, Button, Tooltip, Typography } from "antd";
import type { Key, MutableRefObject } from "react";
import { useEffect, useState } from "react";

import type {
  ProductCreateValues,
  ProductFilterOption,
  ProductRecord,
} from "../_lib/products";
import {
  createProductRecord,
  requestProductRecords,
  deleteProductRecord,
} from "../_lib/products-request";
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
  const [copyingProduct, setCopyingProduct] = useState(false);
  const [downloadingLabel, setDownloadingLabel] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [reloadSignal, setReloadSignal] = useState(0);
  const { message, modal } = App.useApp();

  useEffect(() => {
    if (reloadSignal === 0) return;

    actionRef?.current?.reload();
  }, [actionRef, reloadSignal]);

  function buildCopiedProductValues(
    product: ProductRecord,
  ): ProductCreateValues | null {
    const productName = product.product_name?.trim();
    if (!productName) return null;

    return {
      product_name: productName,
      product_english_name: product.product_english_name,
      sku: product.sku,
      store_name: product.store_name,
      product_image_url: product.product_image_url,
      product_parameters: product.product_parameters,
      packing_list: product.packing_list,
      color_box_size: product.color_box_size,
      single_gross_weight: product.single_gross_weight,
      product_unit_price: product.product_unit_price,
      carton_spec: product.carton_spec,
      pcs_per_carton: product.pcs_per_carton,
      customs_code: product.customs_code,
      product_category: product.product_category,
      product_usage: product.product_usage,
      product_attribute: product.product_attribute,
      product_material: product.product_material,
      product_id: null,
      ml_code: null,
      product_label_url: null,
    };
  }

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

  async function handleCopyProduct() {
    if (!selectedProduct) {
      message.warning("请先选择一个产品");
      return;
    }

    const values = buildCopiedProductValues(selectedProduct);
    if (!values) {
      message.error("当前产品缺少产品名称，不能复制");
      return;
    }

    try {
      setCopyingProduct(true);
      await createProductRecord(values);
      message.success("复制成功");
      setReloadSignal((value) => value + 1);
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "复制产品失败";
      message.error(description);
    } finally {
      setCopyingProduct(false);
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
          setReloadSignal((value) => value + 1);
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
          <Tooltip
            key="copy"
            title={selectedProduct ? "复制产品" : "请先选择一个产品"}
          >
            <Button
              type="text"
              icon={<CopyOutlined />}
              loading={copyingProduct}
              disabled={!selectedProduct}
              onClick={handleCopyProduct}
            />
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
