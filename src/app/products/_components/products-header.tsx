"use client";

import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Space, Typography } from "antd";

type ProductsHeaderProps = {
  onReload: () => void;
  onCreate: () => void;
  canReload: boolean;
};

function ProductsHeaderActions({
  onReload,
  onCreate,
  canReload,
}: ProductsHeaderProps) {
  return (
    <Space>
      <Button icon={<ReloadOutlined />} onClick={onReload} disabled={!canReload}>
        刷新
      </Button>
      <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
        新增产品
      </Button>
    </Space>
  );
}

export default function ProductsHeader(props: ProductsHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <Typography.Title level={3} className="!mb-1">
          产品管理
        </Typography.Title>
        <Typography.Text type="secondary">
          维护产品基础资料、包装资料和店铺关联信息
        </Typography.Text>
      </div>
      <ProductsHeaderActions {...props} />
    </header>
  );
}
