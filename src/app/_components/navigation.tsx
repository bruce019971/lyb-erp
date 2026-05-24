"use client";

import {
  AppstoreOutlined,
  BarsOutlined,
  ControlOutlined,
  DollarOutlined,
  LogoutOutlined,
  ProfileOutlined,
  SafetyCertificateOutlined,
  TagsOutlined,
  ShopOutlined,
  ShoppingOutlined,
  TruckOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import { Menu, Typography } from "antd";
import type { ReactNode } from "react";
import type { DataNode } from "antd/es/tree";

export type PageKey =
  | "shipments"
  | "products"
  | "stores"
  | "logistics"
  | "relabels"
  | "freights"
  | "profile"
  | "users"
  | "roles";

type NavSectionKey = "core" | "system";

export type PageConfig = {
  key: PageKey;
  label: string;
  icon: ReactNode;
  href: string;
  section: NavSectionKey;
};

export type MenuPermissionKey = PageKey | NavSectionKey;

export const pageConfigs: PageConfig[] = [
  {
    key: "products",
    label: "产品管理",
    icon: <ShoppingOutlined />,
    href: "/products",
    section: "core",
  },
  {
    key: "shipments",
    label: "货件管理",
    icon: <TruckOutlined />,
    href: "/shipments",
    section: "core",
  },
  {
    key: "freights",
    label: "运费管理",
    icon: <DollarOutlined />,
    href: "/freights",
    section: "core",
  },
  {
    key: "relabels",
    label: "换标管理",
    icon: <TagsOutlined />,
    href: "/relabels",
    section: "core",
  },
  {
    key: "stores",
    label: "店铺管理",
    icon: <ShopOutlined />,
    href: "/stores",
    section: "core",
  },
  {
    key: "logistics",
    label: "物流管理",
    icon: <AppstoreOutlined />,
    href: "/logistics",
    section: "core",
  },
  {
    key: "profile",
    label: "个人中心",
    icon: <ProfileOutlined />,
    href: "/profile",
    section: "system",
  },
  {
    key: "users",
    label: "用户管理",
    icon: <UserOutlined />,
    href: "/users",
    section: "system",
  },
  {
    key: "roles",
    label: "角色管理",
    icon: <SafetyCertificateOutlined />,
    href: "/roles",
    section: "system",
  },
];

const permissionManagedPageConfigs = pageConfigs.filter(
  (item) => item.key !== "profile",
);

export const menuPermissionTreeData: DataNode[] = [
  {
    key: "core",
    title: "业务管理",
    children: permissionManagedPageConfigs
      .filter((item) => item.section === "core")
      .map((item) => ({
        key: item.key,
        title: item.label,
      })),
  },
  {
    key: "system",
    title: "系统管理",
    children: permissionManagedPageConfigs
      .filter((item) => item.section === "system")
      .map((item) => ({
        key: item.key,
        title: item.label,
      })),
  },
];

export function buildMenuPermissionSummary(keys: string[]) {
  const pageKeySet = new Set(permissionManagedPageConfigs.map((item) => item.key));
  const selectedPageCount = keys.filter((key) => pageKeySet.has(key as PageKey)).length;

  return selectedPageCount > 0 ? `${selectedPageCount}项菜单权限` : "未配置";
}

type AppSidebarProps = {
  activeKey: PageKey;
  onOpenPage?: (key: PageKey) => void;
  visiblePageKeys?: PageKey[];
  currentUserName?: string | null;
  onLogout?: () => void;
};

export function AppSidebar({
  activeKey,
  onOpenPage,
  visiblePageKeys,
  currentUserName,
  onLogout,
}: AppSidebarProps) {
  const logoutMenuKey = "__logout__";
  const visibleKeySet = new Set(
    visiblePageKeys ?? pageConfigs.map((item) => item.key),
  );
  const visiblePageConfigs = pageConfigs.filter((item) =>
    visibleKeySet.has(item.key),
  );
  const corePages = visiblePageConfigs.filter((item) => item.section === "core");
  const systemPages = visiblePageConfigs.filter(
    (item) => item.section === "system",
  );

  const menuItems: MenuProps["items"] = [
    ...(corePages.length
      ? [
          {
            key: "core",
            icon: <AppstoreOutlined />,
            label: "业务管理",
            children: corePages.map((item) => ({
              key: item.key,
              icon: item.icon,
              label: item.label,
            })),
          },
        ]
      : []),
    ...(systemPages.length
      ? [
          {
            key: "system",
            icon: <ControlOutlined />,
            label: "系统管理",
            children: [
              ...systemPages.map((item) => ({
                key: item.key,
                icon: item.icon,
                label: item.label,
              })),
              ...(onLogout
                ? [
                    {
                      key: logoutMenuKey,
                      icon: <LogoutOutlined />,
                      label: "登出",
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
  ];

  return (
    <div className="flex h-full flex-col">
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
        className="flex-1 border-none !bg-[#1f2a44] py-3"
        selectedKeys={[activeKey]}
        defaultOpenKeys={["core", "system"]}
        items={menuItems}
        onClick={({ key }) => {
          if (key === logoutMenuKey) {
            onLogout?.();
            return;
          }

          if (onOpenPage) {
            onOpenPage(key as PageKey);
            return;
          }

          const target = pageConfigs.find((item) => item.key === key);
          if (target) window.location.href = target.href;
        }}
      />
      <div className="border-t border-white/10 px-5 py-4">
        <Typography.Text className="block !text-sm !text-slate-300">
          {currentUserName || "未登录用户"}
        </Typography.Text>
      </div>
    </div>
  );
}
