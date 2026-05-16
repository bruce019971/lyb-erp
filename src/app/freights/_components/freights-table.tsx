"use client";

import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import type { MutableRefObject } from "react";

import type { FreightRecord } from "../_lib/freights";
import { requestFreightRecords } from "../_lib/freights-request";
import { getFreightColumns } from "./freights-columns";

type FreightsTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  onEdit: (record: FreightRecord) => void;
};

export default function FreightsTable({
  actionRef,
  onEdit,
}: FreightsTableProps) {
  return (
    <ProTable<FreightRecord>
      actionRef={actionRef}
      rowKey="id"
      columns={getFreightColumns(onEdit)}
      search={false}
      options={{
        density: false,
        fullScreen: false,
        reload: false,
        setting: true,
      }}
      scroll={{ x: 1200 }}
      pagination={{
        defaultPageSize: 20,
        showSizeChanger: true,
      }}
      dateFormatter="string"
      request={requestFreightRecords}
    />
  );
}
