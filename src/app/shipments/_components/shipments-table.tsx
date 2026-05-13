"use client";

import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import type { MutableRefObject } from "react";

import { requestShipmentRecords } from "../_lib/shipments-request";
import { shipmentColumns } from "./shipments-columns";
import type { ShipmentRecord } from "../_lib/shipments";

type ShipmentsTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
};

export default function ShipmentsTable({
  actionRef,
}: ShipmentsTableProps) {
  return (
    <ProTable<ShipmentRecord>
      actionRef={actionRef}
      rowKey="id"
      columns={shipmentColumns}
      scroll={{ x: 2200 }}
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
      request={requestShipmentRecords}
    />
  );
}
