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

export function getLogisticsProviderColumns(
  onEdit: (record: LogisticsProviderRecord) => void,
): ProColumns<LogisticsProviderRecord>[] {
  return [
    {
      title: "物流商",
      dataIndex: "provider_name",
      width: 320,
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
