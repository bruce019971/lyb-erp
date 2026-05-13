"use client";

import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Space, Typography } from "antd";

type StoresHeaderProps = {
  onReload: () => void;
  onCreate: () => void;
  canReload: boolean;
};

function StoresHeaderActions({
  onReload,
  onCreate,
  canReload,
}: StoresHeaderProps) {
  return (
    <Space>
      <Button icon={<ReloadOutlined />} onClick={onReload} disabled={!canReload}>
        刷新
      </Button>
      <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
        新增店铺
      </Button>
    </Space>
  );
}

export default function StoresHeader(props: StoresHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <Typography.Title level={3} className="!mb-1">
          店铺管理
        </Typography.Title>
        <Typography.Text type="secondary">
          维护店铺 ID、名称、地址和类型
        </Typography.Text>
      </div>
      <StoresHeaderActions {...props} />
    </header>
  );
}
