"use client";

import {
  AppstoreOutlined,
  BarsOutlined,
  ShopOutlined,
  ShoppingOutlined,
  TruckOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import { Menu, Typography } from "antd";
import type { ReactNode } from "react";

export type PageKey = "shipments" | "products" | "stores" | "logistics";

export type PageConfig = {
  key: PageKey;
  label: string;
  icon: ReactNode;
  href: string;
};

export const pageConfigs: PageConfig[] = [
  {
    key: "products",
    label: "产品管理",
    icon: <ShoppingOutlined />,
    href: "/products",
  },
  {
    key: "shipments",
    label: "货件管理",
    icon: <TruckOutlined />,
    href: "/shipments",
  },
  {
    key: "stores",
    label: "店铺管理",
    icon: <ShopOutlined />,
    href: "/stores",
  },
  {
    key: "logistics",
    label: "物流管理",
    icon: <AppstoreOutlined />,
    href: "/logistics",
  },
];

type AppSidebarProps = {
  activeKey: PageKey;
  onOpenPage?: (key: PageKey) => void;
};

export function AppSidebar({ activeKey, onOpenPage }: AppSidebarProps) {
  const menuItems: MenuProps["items"] = [
    {
      key: "core",
      label: "业务管理",
      type: "group",
      children: pageConfigs.map((item) => ({
        key: item.key,
        icon: item.icon,
        label: item.label,
      })),
    },
  ];

  return (
    <>
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-500 text-lg text-white">
          <BarsOutlined />
        </span>
        <div className="min-w-0">
          <Typography.Text className="block !text-base !font-semibold !text-white">
            玲伊贝ERP
          </Typography.Text>
          <Typography.Text className="block !text-xs !text-slate-300">
            跨境电商管理系统
          </Typography.Text>
        </div>
      </div>
      <Menu
        theme="dark"
        mode="inline"
        className="border-none !bg-[#1f2a44] py-3"
        selectedKeys={[activeKey]}
        defaultOpenKeys={["core"]}
        items={menuItems}
        onClick={({ key }) => {
          if (onOpenPage) {
            onOpenPage(key as PageKey);
            return;
          }

          const target = pageConfigs.find((item) => item.key === key);
          if (target) window.location.href = target.href;
        }}
      />
    </>
  );
}
