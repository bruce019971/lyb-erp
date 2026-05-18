import { EditOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import { Button, Tooltip, Typography } from "antd";

import type { StoreRecord } from "../_lib/stores";

function getStoreHref(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function getStoreColumns(
  onEdit: (record: StoreRecord) => void,
): ProColumns<StoreRecord>[] {
  return [
    {
      title: "店铺ID",
      dataIndex: "seller_id",
      width: 160,
      copyable: true,
    },
    {
      title: "店铺名称",
      dataIndex: "seller_name",
      width: 240,
      ellipsis: true,
      render: (_, record) => {
        const href = getStoreHref(record.seller_address);

        return record.seller_name ? (
          href ? (
            <Typography.Link href={href} target="_blank">
              {record.seller_name}
            </Typography.Link>
          ) : (
            record.seller_name
          )
        ) : (
          "-"
        );
      },
    },
    {
      title: "店铺Code",
      dataIndex: "seller_code",
      width: 140,
      ellipsis: true,
      copyable: true,
    },
    {
      title: "店铺类型",
      dataIndex: "seller_type",
      width: 140,
      ellipsis: true,
      valueType: "select",
      valueEnum: {
        CBT: { text: "CBT" },
        本土: { text: "本土" },
      },
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
