import { EditOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Button, Tooltip, Typography } from "antd";

import type { LogisticsProviderRecord } from "../_lib/logistics";

function EmptyText() {
  return <Typography.Text type="secondary">-</Typography.Text>;
}

function getSystemHref(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getInvoiceTemplateName(providerName?: string | null) {
  return `${providerName?.trim() || "物流商"}发票模板`;
}

function formatPrice(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(2)
    : "-";
}

export function getLogisticsProviderColumns(
  onEdit: (record: LogisticsProviderRecord) => void,
): ProColumns<LogisticsProviderRecord>[] {
  return [
    {
      title: "物流商",
      dataIndex: "provider_name",
      width: 260,
      ellipsis: true,
      render: (_, record) => {
        const href = getSystemHref(record.system_url);

        return record.provider_name ? (
          href ? (
            <Typography.Link href={href} target="_blank">
              {record.provider_name}
            </Typography.Link>
          ) : (
            record.provider_name
          )
        ) : (
          <EmptyText />
        );
      },
    },
    {
      title: "发票模板",
      dataIndex: "invoice_template_url",
      width: 120,
      search: false,
      render: (_, record) =>
        record.invoice_template_url?.trim() ? (
          <Typography.Link
            href={record.invoice_template_url.trim()}
            target="_blank"
          >
            {getInvoiceTemplateName(record.provider_name)}
          </Typography.Link>
        ) : (
          <EmptyText />
        ),
    },
    {
      title: "运费单价",
      dataIndex: "general_freight_unit_price",
      width: 160,
      search: false,
      render: (_, record) => (
        <div className="flex flex-col whitespace-nowrap leading-6">
          <span>普货: {formatPrice(record.general_freight_unit_price)}</span>
          <span>纺织品: {formatPrice(record.textile_freight_unit_price)}</span>
        </div>
      ),
    },
    {
      title: "产品标单价",
      dataIndex: "product_label_unit_price",
      width: 120,
      search: false,
      render: (_, record) =>
        typeof record.product_label_unit_price === "number"
          ? record.product_label_unit_price.toFixed(2)
          : "",
    },
    {
      title: "外箱标单价",
      dataIndex: "carton_label_unit_price",
      width: 120,
      search: false,
      render: (_, record) =>
        typeof record.carton_label_unit_price === "number"
          ? record.carton_label_unit_price.toFixed(2)
          : "",
    },
    {
      title: "操作",
      valueType: "option",
      width: 64,
      fixed: "right",
      render: (_, record) => (
        <Tooltip title="编辑">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => onEdit(record)}
          />
        </Tooltip>
      ),
    },
  ];
}
