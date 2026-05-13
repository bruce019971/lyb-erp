"use client";

import { CloseOutlined } from "@ant-design/icons";
import type { TabsProps } from "antd";
import { Layout, Tabs } from "antd";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import LogisticsPage from "../logistics/_components/logistics-page";
import ProductsPage from "../products/_components/products-page";
import ShipmentsPage from "../shipments/_components/shipments-page";
import StoresPage from "../stores/_components/stores-page";
import { AppSidebar, pageConfigs, type PageKey } from "./navigation";

const { Sider, Content } = Layout;

const pageConfigMap = new Map(pageConfigs.map((item) => [item.key, item]));

type WorkbenchProps = {
  initialActiveKey?: PageKey;
};

function renderPage(key: PageKey) {
  if (key === "shipments") return <ShipmentsPage embedded />;
  if (key === "products") return <ProductsPage />;
  if (key === "stores") return <StoresPage />;
  return <LogisticsPage />;
}

function getFallbackActiveKey(tabs: PageKey[], targetKey: PageKey) {
  const targetIndex = tabs.indexOf(targetKey);
  const nextKey = tabs[targetIndex + 1] ?? tabs[targetIndex - 1];
  return nextKey ?? "shipments";
}

export default function Workbench({
  initialActiveKey = "shipments",
}: WorkbenchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [openTabs, setOpenTabs] = useState<PageKey[]>([initialActiveKey]);
  const [activeKey, setActiveKey] = useState<PageKey>(initialActiveKey);

  const tabItems = useMemo<TabsProps["items"]>(
    () =>
      openTabs.map((key) => {
        const page = pageConfigMap.get(key)!;
        return {
          key,
          label: page.label,
          children: renderPage(key),
          closable: true,
          closeIcon: <CloseOutlined />,
        };
      }),
    [openTabs],
  );

  function openPage(key: PageKey) {
    setOpenTabs((tabs) => (tabs.includes(key) ? tabs : [...tabs, key]));
    setActiveKey(key);

    const page = pageConfigMap.get(key);
    if (page && pathname !== page.href) router.push(page.href);
  }

  function closePage(targetKey: PageKey) {
    setOpenTabs((tabs) => {
      const nextTabs = tabs.filter((key) => key !== targetKey);
      if (activeKey === targetKey) {
        const fallbackKey = getFallbackActiveKey(tabs, targetKey);
        setActiveKey(fallbackKey);

        const page = pageConfigMap.get(fallbackKey);
        if (page && pathname !== page.href) router.push(page.href);
      }
      return nextTabs.length ? nextTabs : ["shipments"];
    });
  }

  return (
    <Layout className="h-screen min-w-[1100px] overflow-hidden bg-slate-100">
      <Sider width={248} className="!bg-[#1f2a44]">
        <AppSidebar activeKey={activeKey} onOpenPage={openPage} />
      </Sider>

      <Layout className="min-w-0 bg-slate-100">
        <Content className="flex min-h-0 flex-col">
          <Tabs
            type="editable-card"
            hideAdd
            activeKey={activeKey}
            items={tabItems}
            className="app-workbench-tabs min-h-0 flex-1"
            onChange={(key) => openPage(key as PageKey)}
            onEdit={(targetKey, action) => {
              if (action === "remove") closePage(targetKey as PageKey);
            }}
          />
        </Content>
      </Layout>
    </Layout>
  );
}
