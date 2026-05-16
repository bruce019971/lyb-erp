"use client";

import { PlusOutlined } from "@ant-design/icons";
import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Button, Tooltip } from "antd";
import type { MutableRefObject } from "react";

import { getUserColumns } from "./users-columns";
import type { UserRecord } from "../_lib/users";
import { requestUserRecords } from "../_lib/users-request";

type UsersTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  onCreate: () => void;
  onEdit: (record: UserRecord) => void;
  onDelete: (record: UserRecord) => void;
  isDeleting: (record: UserRecord) => boolean;
};

export default function UsersTable({
  actionRef,
  onCreate,
  onEdit,
  onDelete,
  isDeleting,
}: UsersTableProps) {
  return (
    <ProTable<UserRecord>
      actionRef={actionRef}
      rowKey="id"
      columns={getUserColumns(onEdit, onDelete, isDeleting)}
      tableAlertRender={false}
      tableAlertOptionRender={false}
      search={false}
      options={{
        density: false,
        fullScreen: false,
        reload: false,
        setting: true,
      }}
      toolBarRender={() => [
        <Tooltip key="create" title="新增用户">
          <Button type="text" icon={<PlusOutlined />} onClick={onCreate} />
        </Tooltip>,
      ]}
      pagination={{
        defaultPageSize: 20,
        showSizeChanger: true,
      }}
      scroll={{ x: 1400 }}
      dateFormatter="string"
      request={requestUserRecords}
    />
  );
}
