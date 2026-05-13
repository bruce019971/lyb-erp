"use client";

import type { ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { App, Button, ConfigProvider, Space, Typography } from "antd";
import { useEffect, useState } from "react";

import ShipmentsTableSkeleton from "../shipments/_components/shipments-table-skeleton";

export type MasterDataRow = {
  id: string;
  [key: string]: string;
};

type MasterDataPageProps = {
  title: string;
  columns: ProColumns<MasterDataRow>[];
};

function MasterDataActions() {
  const { message } = App.useApp();

  return (
    <Space>
      <Button
        icon={<ReloadOutlined />}
        onClick={() => message.info("暂无可刷新数据")}
      >
        刷新
      </Button>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={() => message.info("请先接入数据表")}
      >
        新增
      </Button>
    </Space>
  );
}

export default function MasterDataPage({
  title,
  columns,
}: MasterDataPageProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <ConfigProvider
      theme={{
        token: {
          borderRadius: 6,
          colorPrimary: "#1677ff",
        },
      }}
    >
      <App>
        <main className="h-full overflow-auto bg-slate-100 px-6 py-6">
          <section className="mx-auto flex max-w-[1600px] flex-col gap-4">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <Typography.Title level={3} className="!mb-1">
                {title}
              </Typography.Title>
              <MasterDataActions />
            </header>

            {mounted ? (
              <ProTable<MasterDataRow>
                rowKey="id"
                columns={columns}
                dataSource={[]}
                search={false}
                options={{
                  density: true,
                  fullScreen: true,
                  reload: false,
                  setting: true,
                }}
                pagination={false}
              />
            ) : (
              <ShipmentsTableSkeleton />
            )}
          </section>
        </main>
      </App>
    </ConfigProvider>
  );
}
