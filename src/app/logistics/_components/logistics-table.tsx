"use client";

import { PlusOutlined } from "@ant-design/icons";
import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Button, Tooltip } from "antd";
import type { MutableRefObject } from "react";

import type { LogisticsProviderRecord } from "../_lib/logistics";
import { requestLogisticsProviderRecords } from "../_lib/logistics-request";
import { getLogisticsProviderColumns } from "./logistics-columns";

type LogisticsTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  providerName?: string;
  onCreate: () => void;
  onEdit: (record: LogisticsProviderRecord) => void;
};

export default function LogisticsTable({
  actionRef,
  providerName,
  onCreate,
  onEdit,
}: LogisticsTableProps) {
  return (
    <ProTable<LogisticsProviderRecord>
      actionRef={actionRef}
      rowKey="id"
      columns={getLogisticsProviderColumns(onEdit)}
      scroll={{ x: 620 }}
      search={false}
      options={false}
      toolBarRender={() => [
        <Tooltip key="create" title="新增物流商">
          <Button type="text" icon={<PlusOutlined />} onClick={onCreate} />
        </Tooltip>,
      ]}
      pagination={{
        defaultPageSize: 20,
        showSizeChanger: true,
      }}
      dateFormatter="string"
      params={{ provider_name: providerName }}
      request={requestLogisticsProviderRecords}
    />
  );
}
