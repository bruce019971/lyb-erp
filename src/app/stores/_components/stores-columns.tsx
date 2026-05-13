import type { ProColumns } from "@ant-design/pro-components";
import { Button, Typography } from "antd";

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
      title: "操作",
      valueType: "option",
      width: 96,
      fixed: "right",
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => onEdit(record)}>
          编辑
        </Button>
      ),
    },
  ];
}
