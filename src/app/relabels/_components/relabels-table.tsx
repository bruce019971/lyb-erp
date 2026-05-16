"use client";

import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Button, Tooltip } from "antd";
import type { MutableRefObject } from "react";

import { requestRelabelRecords } from "../_lib/relabels-request";
import { isRelabelAlert, type RelabelRecord } from "../_lib/relabels";
import { getRelabelColumns } from "./relabels-columns";

type RelabelsTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  onCreate: () => void;
  onEdit: (record: RelabelRecord) => void;
  onChangeInstructionSubmitted: (record: RelabelRecord, value: string) => void;
  onChangeDeliveryStatus: (record: RelabelRecord, value: string) => void;
  isStatusUpdating: (
    record: RelabelRecord,
    field: "instruction_submitted" | "delivery_status",
  ) => boolean;
};

export default function RelabelsTable({
  actionRef,
  onCreate,
  onEdit,
  onChangeInstructionSubmitted,
  onChangeDeliveryStatus,
  isStatusUpdating,
}: RelabelsTableProps) {
  return (
    <ProTable<RelabelRecord>
      actionRef={actionRef}
      rowKey="id"
      columns={getRelabelColumns(
        onEdit,
        onChangeInstructionSubmitted,
        onChangeDeliveryStatus,
        isStatusUpdating,
      )}
      rowClassName={(record) =>
        isRelabelAlert(record) ? "relabel-alert-row" : ""
      }
      search={false}
      options={{
        density: false,
        fullScreen: false,
        reload: false,
        setting: true,
      }}
      toolBarRender={() => [
        <Tooltip key="create" title="新增换标记录">
          <Button type="text" icon={<PlusOutlined />} onClick={onCreate} />
        </Tooltip>,
        <Tooltip key="reload" title="刷新列表">
          <Button
            type="text"
            icon={<ReloadOutlined />}
            onClick={() => actionRef?.current?.reload()}
          />
        </Tooltip>,
      ]}
      scroll={{ x: 980 }}
      pagination={{
        defaultPageSize: 20,
        showSizeChanger: true,
      }}
      dateFormatter="string"
      request={requestRelabelRecords}
    />
  );
}
