"use client";

import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { Button, Tooltip } from "antd";
import type { MutableRefObject } from "react";

import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";
import { requestRelabelRecords } from "../_lib/relabels-request";
import type { RelabelRecord } from "../_lib/relabels";
import { getRelabelColumns } from "./relabels-columns";

type RelabelsTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  originalShipmentNo?: string;
  onCreate: () => void;
  onEdit: (record: RelabelRecord) => void;
  onDelete: (record: RelabelRecord) => void;
  onStartDeliveryStatusEdit: (record: RelabelRecord) => void;
  onCancelDeliveryStatusEdit: () => void;
  onChangeDeliveryStatus: (record: RelabelRecord, value: string) => void;
  isDeliveryStatusEditing: (record: RelabelRecord) => boolean;
  isStatusUpdating: (
    record: RelabelRecord,
    field: "delivery_status",
  ) => boolean;
  isDeleting: (record: RelabelRecord) => boolean;
  logisticsOptions: LogisticsProviderOption[];
};

export default function RelabelsTable({
  actionRef,
  originalShipmentNo,
  onCreate,
  onEdit,
  onDelete,
  onStartDeliveryStatusEdit,
  onCancelDeliveryStatusEdit,
  onChangeDeliveryStatus,
  isDeliveryStatusEditing,
  isStatusUpdating,
  isDeleting,
  logisticsOptions,
}: RelabelsTableProps) {
  return (
    <ProTable<RelabelRecord>
      actionRef={actionRef}
      rowKey="id"
      columns={getRelabelColumns(
        onEdit,
        onDelete,
        onStartDeliveryStatusEdit,
        onCancelDeliveryStatusEdit,
        onChangeDeliveryStatus,
        isDeliveryStatusEditing,
        isStatusUpdating,
        isDeleting,
        logisticsOptions,
      )}
      rowClassName={(record) =>
        record.delivery_status === "是" ? "relabel-delivered-row" : ""
      }
      search={{
        labelWidth: "auto",
        defaultCollapsed: false,
      }}
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
      scroll={{ x: 950 }}
      pagination={{
        defaultPageSize: 20,
        showSizeChanger: true,
      }}
      dateFormatter="string"
      form={{
        initialValues: {
          original_shipment_no: originalShipmentNo ? [originalShipmentNo] : [],
        },
      }}
      request={requestRelabelRecords}
    />
  );
}
