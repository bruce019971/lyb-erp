"use client";

import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import type { MutableRefObject } from "react";

import type { StoreRecord } from "../_lib/stores";
import { requestStoreRecords } from "../_lib/stores-request";
import { getStoreColumns } from "./stores-columns";

type StoresTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  onEdit: (record: StoreRecord) => void;
};

export default function StoresTable({ actionRef, onEdit }: StoresTableProps) {
  return (
    <ProTable<StoreRecord>
      actionRef={actionRef}
      rowKey="id"
      columns={getStoreColumns(onEdit)}
      scroll={{ x: 900 }}
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
      request={requestStoreRecords}
    />
  );
}
