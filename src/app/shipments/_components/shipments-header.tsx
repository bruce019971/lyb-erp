import { ReloadOutlined } from "@ant-design/icons";
import { Button, Space, Typography } from "antd";

type ShipmentsHeaderProps = {
  onReload: () => void;
  canReload: boolean;
};

export default function ShipmentsHeader({
  onReload,
  canReload,
}: ShipmentsHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <Typography.Title level={3} className="!mb-1">
          货件管理
        </Typography.Title>
      </div>
      <Space>
        <Button
          icon={<ReloadOutlined />}
          onClick={onReload}
          disabled={!canReload}
        >
          刷新
        </Button>
      </Space>
    </header>
  );
}
