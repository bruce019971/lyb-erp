"use client";

import { DownloadOutlined } from "@ant-design/icons";
import {
  Button,
  Descriptions,
  Drawer,
  Image,
  Space,
  Tag,
  Typography,
} from "antd";

import type { ProductRecord } from "../_lib/products";

type ProductViewDrawerProps = {
  open: boolean;
  record?: ProductRecord;
  onClose: () => void;
};

function EmptyText() {
  return <Typography.Text type="secondary">-</Typography.Text>;
}

function getExternalHref(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function renderText(value?: string | null) {
  return value?.trim() ? value : <EmptyText />;
}

function renderLink(value?: string | null) {
  const href = getExternalHref(value);
  return href ? (
    <Typography.Link href={href} target="_blank">
      {value}
    </Typography.Link>
  ) : (
    renderText(value)
  );
}

function renderMultiline(value?: string | null) {
  return value?.trim() ? (
    <Typography.Paragraph className="!mb-0 whitespace-pre-wrap">
      {value}
    </Typography.Paragraph>
  ) : (
    <EmptyText />
  );
}

export default function ProductViewDrawer({
  open,
  record,
  onClose,
}: ProductViewDrawerProps) {
  const labelHref = record?.product_label_url?.trim();

  return (
    <Drawer
      title="查看产品"
      width={760}
      open={open}
      destroyOnHidden
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <Space>
            {labelHref ? (
              <Button
                icon={<DownloadOutlined />}
                href={labelHref}
                target="_blank"
              >
                下载产品标签
              </Button>
            ) : (
              <Tag color="default">未上传产品标签</Tag>
            )}
            <Button type="primary" onClick={onClose}>
              关闭
            </Button>
          </Space>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          {record?.product_image_url ? (
            <Image
              src={record.product_image_url}
              alt={record.product_name ?? "产品图片"}
              width={120}
              height={120}
              className="rounded object-cover"
            />
          ) : (
            <EmptyText />
          )}
        </div>

        <Descriptions
          bordered
          column={2}
          size="middle"
          items={[
            {
              key: "product_name",
              label: "产品名称",
              children: renderText(record?.product_name),
              span: 2,
            },
            {
              key: "store_name",
              label: "所在店铺",
              children: renderText(record?.store_name),
              span: 2,
            },
            {
              key: "product_url",
              label: "产品链接",
              children: renderLink(record?.product_url),
              span: 2,
            },
            {
              key: "product_id",
              label: "产品ID",
              children: renderText(record?.product_id),
            },
            { key: "sku", label: "SKU", children: renderText(record?.sku) },
            {
              key: "ml_code",
              label: "ML Code",
              children: renderText(record?.ml_code),
            },
            {
              key: "product_unit_price",
              label: "产品单价",
              children: record?.product_unit_price ?? <EmptyText />,
            },
            {
              key: "color_box_size",
              label: "彩盒尺寸(cm)",
              children: renderText(record?.color_box_size),
            },
            {
              key: "single_gross_weight",
              label: "单个毛重(kg)",
              children: record?.single_gross_weight ?? <EmptyText />,
            },
            {
              key: "carton_spec",
              label: "箱规(cm)",
              children: renderText(record?.carton_spec),
            },
            {
              key: "pcs_per_carton",
              label: "装箱数量(pcs/箱）",
              children: record?.pcs_per_carton ?? <EmptyText />,
            },
            {
              key: "product_parameters",
              label: "产品参数",
              children: renderMultiline(record?.product_parameters),
              span: 2,
            },
            {
              key: "packing_list",
              label: "包装清单",
              children: renderMultiline(record?.packing_list),
              span: 2,
            },
          ]}
        />
      </div>
    </Drawer>
  );
}
