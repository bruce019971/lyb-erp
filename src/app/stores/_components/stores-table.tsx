"use client";

import { PlusOutlined } from "@ant-design/icons";
import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Button, Tooltip } from "antd";
import type { MutableRefObject } from "react";

import type { StoreRecord } from "../_lib/stores";
import { requestStoreRecords } from "../_lib/stores-request";
import { getStoreColumns } from "./stores-columns";

type StoresTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  sellerName?: string;
  onCreate: () => void;
  onEdit: (record: StoreRecord) => void;
};

export default function StoresTable({
  actionRef,
  sellerName,
  onCreate,
  onEdit,
}: StoresTableProps) {
  return (
    <ProTable<StoreRecord>
      actionRef={actionRef}
      rowKey="id"
      columns={getStoreColumns(onEdit)}
      scroll={{ x: 1140 }}
      search={false}
      options={{
        density: false,
        fullScreen: false,
        reload: false,
        setting: true,
      }}
      toolBarRender={() => [
        <Tooltip key="create" title="新增店铺">
          <Button type="text" icon={<PlusOutlined />} onClick={onCreate} />
        </Tooltip>,
      ]}
      pagination={{
        defaultPageSize: 20,
        showSizeChanger: true,
      }}
      dateFormatter="string"
      params={{ seller_name: sellerName }}
      request={requestStoreRecords}
    />
  );
}
