"use client";

import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import type { MutableRefObject } from "react";

import type { LogisticsProviderRecord } from "../_lib/logistics";
import { requestLogisticsProviderRecords } from "../_lib/logistics-request";
import { logisticsProviderColumns } from "./logistics-columns";

type LogisticsTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
};

export default function LogisticsTable({ actionRef }: LogisticsTableProps) {
  return (
    <ProTable<LogisticsProviderRecord>
      actionRef={actionRef}
      rowKey="id"
      columns={logisticsProviderColumns}
      scroll={{ x: 720 }}
      search={{
        labelWidth: "auto",
        defaultCollapsed: false,
      }}
      options={{
        density: true,
        fullScreen: true,
        reload: true,
        setting: true,
      }}
      pagination={{
        defaultPageSize: 20,
        showSizeChanger: true,
      }}
      dateFormatter="string"
      request={requestLogisticsProviderRecords}
    />
  );
}
