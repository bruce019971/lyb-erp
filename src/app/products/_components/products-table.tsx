"use client";

import type { ActionType } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import type { MutableRefObject } from "react";

import type { ProductRecord } from "../_lib/products";
import { requestProductRecords } from "../_lib/products-request";
import { getProductColumns } from "./products-columns";

type ProductsTableProps = {
  actionRef?: MutableRefObject<ActionType | undefined>;
  onEdit: (record: ProductRecord) => void;
};

export default function ProductsTable({ actionRef, onEdit }: ProductsTableProps) {
  return (
    <ProTable<ProductRecord>
      actionRef={actionRef}
      rowKey="id"
      columns={getProductColumns(onEdit)}
      scroll={{ x: 1900 }}
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
      request={requestProductRecords}
    />
  );
}
