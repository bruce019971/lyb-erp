"use client";

import { PlusOutlined } from "@ant-design/icons";
import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Button, Tooltip } from "antd";
import type { MutableRefObject } from "react";

import { getRoleColumns } from "./roles-columns";
import type { RoleRecord } from "../_lib/roles";
import { requestRoleRecords } from "../_lib/roles-request";

type RolesTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  onCreate: () => void;
  onEdit: (record: RoleRecord) => void;
  onDelete: (record: RoleRecord) => void;
  isDeleting: (record: RoleRecord) => boolean;
};

export default function RolesTable({
  actionRef,
  onCreate,
  onEdit,
  onDelete,
  isDeleting,
}: RolesTableProps) {
  return (
    <ProTable<RoleRecord>
      actionRef={actionRef}
      rowKey="id"
      columns={getRoleColumns(onEdit, onDelete, isDeleting)}
      search={false}
      options={{
        density: false,
        fullScreen: false,
        reload: false,
        setting: true,
      }}
      toolBarRender={() => [
        <Tooltip key="create" title="新增角色">
          <Button type="text" icon={<PlusOutlined />} onClick={onCreate} />
        </Tooltip>,
      ]}
      pagination={{
        defaultPageSize: 20,
        showSizeChanger: true,
      }}
      scroll={{ x: 1120 }}
      dateFormatter="string"
      request={requestRoleRecords}
    />
  );
}
