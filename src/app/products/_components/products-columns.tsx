import type { ProColumns } from "@ant-design/pro-components";
import { Button, Image, Typography } from "antd";

import type { ProductFilterOption, ProductRecord } from "../_lib/products";

function EmptyText() {
  return <Typography.Text type="secondary">-</Typography.Text>;
}

function getExternalHref(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function getProductColumns(
  onView: (record: ProductRecord) => void,
  onEdit: (record: ProductRecord) => void,
  productNameOptions: ProductFilterOption[],
  skuOptions: ProductFilterOption[],
  storeNameOptions: ProductFilterOption[],
): ProColumns<ProductRecord>[] {
  return [
    {
      title: "产品名称",
      dataIndex: "product_name",
      hideInTable: true,
      valueType: "select",
      fieldProps: {
        mode: "multiple",
        allowClear: true,
        showSearch: true,
        optionFilterProp: "label",
        options: productNameOptions,
        placeholder: "请选择产品名称",
      },
    },
    {
      title: "SKU",
      dataIndex: "sku",
      hideInTable: true,
      valueType: "select",
      fieldProps: {
        mode: "multiple",
        allowClear: true,
        showSearch: true,
        optionFilterProp: "label",
        options: skuOptions,
        placeholder: "请选择SKU",
      },
    },
    {
      title: "所在店铺",
      dataIndex: "store_name",
      hideInTable: true,
      valueType: "select",
      fieldProps: {
        mode: "multiple",
        allowClear: true,
        showSearch: true,
        optionFilterProp: "label",
        options: storeNameOptions,
        placeholder: "请选择所在店铺",
      },
    },
    {
      title: "产品图片",
      dataIndex: "product_image_url",
      width: 92,
      fixed: "left",
      search: false,
      render: (_, record) =>
        record.product_image_url ? (
          <Image
            src={record.product_image_url}
            alt={record.product_name ?? "产品图片"}
            width={48}
            height={48}
            className="rounded object-cover"
          />
        ) : (
          <EmptyText />
        ),
    },
    {
      title: "产品名称",
      dataIndex: "product_name",
      width: 220,
      fixed: "left",
      ellipsis: true,
      search: false,
      render: (_, record) => {
        const href = record.product_url?.trim();

        return record.product_name ? (
          href ? (
            <Typography.Link href={href} target="_blank">
              {record.product_name}
            </Typography.Link>
          ) : (
            record.product_name
          )
        ) : (
          <EmptyText />
        );
      },
    },
    {
      title: "产品ID/SKU",
      dataIndex: "product_id",
      width: 260,
      search: false,
      render: (_, record) => (
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <Typography.Text type="secondary">ID:</Typography.Text>
            <Typography.Text
              className="whitespace-nowrap"
              copyable={record.product_id ? { text: record.product_id } : false}
            >
              {record.product_id ?? "-"}
            </Typography.Text>
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <Typography.Text type="secondary">SKU:</Typography.Text>
            <Typography.Text
              className="whitespace-nowrap"
              copyable={record.sku ? { text: record.sku } : false}
            >
              {record.sku ?? "-"}
            </Typography.Text>
          </div>
        </div>
      ),
    },
    {
      title: "ML Code",
      dataIndex: "ml_code",
      width: 130,
      search: false,
      copyable: true,
    },
    {
      title: "所在店铺",
      dataIndex: "store_name",
      width: 140,
      ellipsis: true,
      search: false,
      render: (_, record) => {
        const href = getExternalHref(record.store_url);

        return record.store_name ? (
          href ? (
            <Typography.Link href={href} target="_blank">
              {record.store_name}
            </Typography.Link>
          ) : (
            record.store_name
          )
        ) : (
          <EmptyText />
        );
      },
    },
    {
      title: "装箱数量(pcs)",
      dataIndex: "pcs_per_carton",
      valueType: "digit",
      width: 120,
      search: false,
    },
    {
      title: "彩盒尺寸(cm)",
      dataIndex: "color_box_size",
      width: 130,
      search: false,
    },
    {
      title: "单个毛重(kg)",
      dataIndex: "single_gross_weight",
      valueType: "digit",
      width: 120,
      search: false,
    },
    {
      title: "产品单价",
      dataIndex: "product_unit_price",
      valueType: "money",
      width: 120,
      search: false,
    },
    {
      title: "箱规",
      dataIndex: "carton_spec",
      width: 140,
      search: false,
      ellipsis: true,
    },
    {
      title: "产品参数",
      dataIndex: "product_parameters",
      width: 220,
      search: false,
      ellipsis: true,
    },
    {
      title: "包装清单",
      dataIndex: "packing_list",
      width: 220,
      search: false,
      ellipsis: true,
    },
    {
      title: "操作",
      valueType: "option",
      width: 140,
      fixed: "right",
      render: (_, record) => (
        <>
          <Button type="link" size="small" onClick={() => onView(record)}>
            查看
          </Button>
          <Button type="link" size="small" onClick={() => onEdit(record)}>
            编辑
          </Button>
        </>
      ),
    },
  ];
}
