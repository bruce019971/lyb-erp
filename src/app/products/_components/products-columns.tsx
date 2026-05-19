import { DeleteOutlined, EditOutlined, EyeOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Button, Image, Tooltip, Typography } from "antd";

import {
  getMercadoLibreProductUrl,
  type ProductFilterOption,
  type ProductRecord,
} from "../_lib/products";

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
  onDelete: (record: ProductRecord) => void,
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
      width: 80,
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
      title: "产品名称/英文名/ML Code",
      dataIndex: "product_name",
      width: 220,
      fixed: "left",
      ellipsis: true,
      search: false,
      render: (_, record) => {
        const href = getMercadoLibreProductUrl(record.product_id);
        const productNameNode = record.product_name ? (
          href ? (
            <Typography.Link href={href} target="_blank">
              {record.product_name}
            </Typography.Link>
          ) : (
            <Typography.Text>{record.product_name}</Typography.Text>
          )
        ) : (
          <EmptyText />
        );

        return (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="truncate">{productNameNode}</div>
            <Typography.Text
              className="truncate"
              type={record.product_english_name ? undefined : "secondary"}
            >
              {record.product_english_name || "-"}
            </Typography.Text>
            <Typography.Text
              className="whitespace-nowrap"
              copyable={record.ml_code ? { text: record.ml_code } : false}
              type={record.ml_code ? undefined : "secondary"}
            >
              {record.ml_code || "-"}
            </Typography.Text>
          </div>
        );
      },
    },
    {
      title: "产品ID/SKU",
      dataIndex: "product_id",
      hideInTable: true,
      width: 200,
      search: false,
      render: (_, record) => {
        const productHref = getMercadoLibreProductUrl(record.product_id);

        return (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2 whitespace-nowrap">
              <Typography.Text type="secondary">ID:</Typography.Text>
              {record.product_id && productHref ? (
                <Typography.Link
                  className="whitespace-nowrap"
                  copyable={{ text: record.product_id }}
                  href={productHref}
                  target="_blank"
                >
                  {record.product_id}
                </Typography.Link>
              ) : (
                <Typography.Text type="secondary">-</Typography.Text>
              )}
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
        );
      },
    },
    {
      title: "所在店铺",
      dataIndex: "store_name",
      width: 120,
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
      title: "产品属性",
      dataIndex: "product_attribute",
      width: 90,
      valueType: "select",
      fieldProps: {
        options: [
          { label: "普货", value: "普货" },
          { label: "纺织品", value: "纺织品" },
        ],
      },
      render: (_, record) => record.product_attribute || <EmptyText />,
    },
    {
      title: "用途",
      dataIndex: "product_usage",
      width: 140,
      search: false,
      ellipsis: true,
    },
    {
      title: "材质",
      dataIndex: "product_material",
      width: 120,
      search: false,
      ellipsis: true,
    },
    {
      title: "装箱数量(pcs)",
      dataIndex: "pcs_per_carton",
      valueType: "digit",
      width: 100,
      search: false,
    },
    {
      title: "海关编码",
      dataIndex: "customs_code",
      width: 120,
      search: false,
    },
    {
      title: "产品类别",
      dataIndex: "product_category",
      width: 120,
      search: false,
      ellipsis: true,
    },
    {
      title: "产品单价",
      dataIndex: "product_unit_price",
      valueType: "money",
      width: 100,
      search: false,
    },
    {
      title: "单个毛重(kg)",
      dataIndex: "single_gross_weight",
      valueType: "digit",
      width: 100,
      search: false,
    },
    {
      title: "彩盒尺寸(cm)",
      dataIndex: "color_box_size",
      width: 110,
      search: false,
      render: (_, record) => (
        <Typography.Text className="whitespace-nowrap">
          {record.color_box_size ?? ""}
        </Typography.Text>
      ),
    },
    {
      title: "箱规尺寸(cm)",
      dataIndex: "carton_spec",
      width: 120,
      search: false,
      ellipsis: true,
    },
    {
      title: "产品参数",
      dataIndex: "product_parameters",
      width: 160,
      search: false,
      ellipsis: true,
    },
    {
      title: "包装清单",
      dataIndex: "packing_list",
      width: 160,
      search: false,
      ellipsis: true,
    },
    {
      title: "操作",
      valueType: "option",
      width: 120,
      fixed: "right",
      render: (_, record) => (
        <div className="flex items-center gap-1">
          <Tooltip title="查看">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => onView(record)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEdit(record)}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onDelete(record)}
            />
          </Tooltip>
        </div>
      ),
    },
  ];
}
