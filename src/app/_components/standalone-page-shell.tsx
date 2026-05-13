"use client";

import { Layout } from "antd";
import type { ReactNode } from "react";

import { AppSidebar, type PageKey } from "./navigation";

const { Sider, Content } = Layout;

type StandalonePageShellProps = {
  activeKey: PageKey;
  children: ReactNode;
};

export default function StandalonePageShell({
  activeKey,
  children,
}: StandalonePageShellProps) {
  return (
    <Layout className="h-screen min-w-[1100px] overflow-hidden bg-slate-100">
      <Sider width={248} className="!bg-[#1f2a44]">
        <AppSidebar activeKey={activeKey} />
      </Sider>
      <Layout className="min-w-0 bg-slate-100">
        <Content className="min-h-0">{children}</Content>
      </Layout>
    </Layout>
  );
}
