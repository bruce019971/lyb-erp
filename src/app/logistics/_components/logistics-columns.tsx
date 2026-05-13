import type { ProColumns } from "@ant-design/pro-components";
import { Typography } from "antd";

import type { LogisticsProviderRecord } from "../_lib/logistics";

function EmptyText() {
  return <Typography.Text type="secondary">-</Typography.Text>;
}

export const logisticsProviderColumns: ProColumns<LogisticsProviderRecord>[] = [
  {
    title: "物流商",
    dataIndex: "provider_name",
    width: 220,
    ellipsis: true,
  },
  {
    title: "系统链接",
    dataIndex: "system_url",
    width: 320,
    ellipsis: true,
    copyable: true,
    render: (_, record) =>
      record.system_url ? (
        <Typography.Link href={record.system_url} target="_blank">
          打开链接
        </Typography.Link>
      ) : (
        <EmptyText />
      ),
  },
];
