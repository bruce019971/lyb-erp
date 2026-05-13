"use client";

import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Space, Typography } from "antd";

type LogisticsHeaderProps = {
  onReload: () => void;
  onCreate: () => void;
  canReload: boolean;
};

function LogisticsHeaderActions({
  onReload,
  onCreate,
  canReload,
}: LogisticsHeaderProps) {
  return (
    <Space>
      <Button icon={<ReloadOutlined />} onClick={onReload} disabled={!canReload}>
        刷新
      </Button>
      <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
        新增物流商
      </Button>
    </Space>
  );
}

export default function LogisticsHeader(props: LogisticsHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <Typography.Title level={3} className="!mb-1">
          物流管理
        </Typography.Title>
        <Typography.Text type="secondary">
          维护物流商和对应系统链接
        </Typography.Text>
      </div>
      <LogisticsHeaderActions {...props} />
    </header>
  );
}
