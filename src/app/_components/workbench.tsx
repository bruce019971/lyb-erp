"use client";

import { CloseOutlined } from "@ant-design/icons";
import type { TabsProps } from "antd";
import { Layout, Spin, Tabs } from "antd";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import FreightsPage from "../freights/_components/freights-page";
import LogisticsPage from "../logistics/_components/logistics-page";
import ProfilePage from "../profile/_components/profile-page";
import ProductsPage from "../products/_components/products-page";
import RelabelsPage from "../relabels/_components/relabels-page";
import RolesPage from "../roles/_components/roles-page";
import ShipmentTracksPage from "../shipment-tracks/_components/shipment-tracks-page";
import ShipmentsPage from "../shipments/_components/shipments-page";
import StoresPage from "../stores/_components/stores-page";
import UsersPage from "../users/_components/users-page";
import {
  clearStoredAuthSession,
  getStoredAuthSession,
  setStoredAuthSession,
  type AuthSession,
} from "@/lib/auth";
import { AppSidebar, pageConfigs, type PageKey } from "./navigation";

const { Sider, Content } = Layout;

const pageConfigMap = new Map(pageConfigs.map((item) => [item.key, item]));
const pageConfigByHref = new Map(pageConfigs.map((item) => [item.href, item]));

type WorkbenchProps = {
  initialActiveKey?: PageKey;
};

function renderPage(key: PageKey) {
  if (key === "shipments") return <ShipmentsPage embedded />;
  if (key === "products") return <ProductsPage />;
  if (key === "stores") return <StoresPage />;
  if (key === "relabels") return <RelabelsPage />;
  if (key === "freights") return <FreightsPage />;
  if (key === "shipment_tracks") return <ShipmentTracksPage />;
  if (key === "profile") return <ProfilePage />;
  if (key === "users") return <UsersPage />;
  if (key === "roles") return <RolesPage />;
  return <LogisticsPage />;
}

function getFallbackActiveKey(
  tabs: PageKey[],
  targetKey: PageKey,
  fallbackKey: PageKey,
) {
  const targetIndex = tabs.indexOf(targetKey);
  const nextKey = tabs[targetIndex + 1] ?? tabs[targetIndex - 1];
  return nextKey ?? fallbackKey;
}

function getPageKeyByPathname(pathname: string) {
  return pageConfigByHref.get(pathname)?.key;
}

export default function Workbench({
  initialActiveKey = "shipments",
}: WorkbenchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [authReady, setAuthReady] = useState(false);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [openTabs, setOpenTabs] = useState<PageKey[]>([]);
  const [activeKey, setActiveKey] = useState<PageKey>(initialActiveKey);

  const allowedPageKeys = useMemo<PageKey[]>(
    () =>
      pageConfigs
        .filter(
          (item) =>
            item.key === "profile" || authSession?.menuPermissions.includes(item.key),
        )
        .map((item) => item.key),
    [authSession],
  );

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const storedSession = getStoredAuthSession();
      if (storedSession && mounted) {
        setAuthSession(storedSession);
      }

      const response = await fetch("/api/auth/session", {
        method: "GET",
        cache: "no-store",
      });

      if (!mounted) return;

      const payload = (await response.json().catch(() => null)) as
        | { data?: AuthSession; error?: string }
        | null;

      if (!response.ok || !payload?.data) {
        clearStoredAuthSession();
        setAuthSession(null);
        router.replace("/login");
        setAuthReady(true);
        return;
      }

      setStoredAuthSession(payload.data);
      setAuthSession(payload.data);
      setAuthReady(true);
    }

    void loadSession();

    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!authReady || !authSession || !allowedPageKeys.length) return;

    const pathnameKey = getPageKeyByPathname(pathname);
    const nextActiveKey =
      pathnameKey && allowedPageKeys.includes(pathnameKey)
        ? pathnameKey
        : allowedPageKeys.includes(initialActiveKey)
          ? initialActiveKey
          : allowedPageKeys[0];

    setOpenTabs((tabs) => {
      const filteredTabs = tabs.filter((key) => allowedPageKeys.includes(key));
      return filteredTabs.includes(nextActiveKey)
        ? filteredTabs
        : [...filteredTabs, nextActiveKey];
    });
    setActiveKey(nextActiveKey);

    const matchedPage = pageConfigs.find((item) => item.href === pathname);
    if (!matchedPage || !allowedPageKeys.includes(matchedPage.key)) {
      const fallbackPage = pageConfigMap.get(nextActiveKey);
      if (fallbackPage && pathname !== fallbackPage.href) {
        router.replace(fallbackPage.href);
      }
    }
  }, [allowedPageKeys, authReady, authSession, initialActiveKey, pathname, router]);

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
    if (!allowedPageKeys.includes(key)) return;

    setOpenTabs((tabs) => (tabs.includes(key) ? tabs : [...tabs, key]));
    setActiveKey(key);

    const page = pageConfigMap.get(key);
    if (page && pathname !== page.href) {
      window.history.pushState(null, "", page.href);
    }
  }

  function closePage(targetKey: PageKey) {
    setOpenTabs((tabs) => {
      const nextTabs = tabs.filter((key) => key !== targetKey);
      if (activeKey === targetKey) {
        const fallbackKey = getFallbackActiveKey(
          tabs,
          targetKey,
          allowedPageKeys[0] ?? "profile",
        );
        setActiveKey(fallbackKey);

        const page = pageConfigMap.get(fallbackKey);
        if (page && pathname !== page.href) {
          window.history.pushState(null, "", page.href);
        }
      }
      return nextTabs.length ? nextTabs : [allowedPageKeys[0] ?? "profile"];
    });
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    }).catch(() => undefined);
    clearStoredAuthSession();
    setAuthSession(null);
    setOpenTabs([]);
    router.replace("/login");
  }

  if (!authReady || !authSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Layout className="h-screen min-w-[1100px] overflow-hidden bg-slate-100">
      <Sider width={248} className="!bg-[#1f2a44]">
        <AppSidebar
          activeKey={activeKey}
          onOpenPage={openPage}
          visiblePageKeys={allowedPageKeys}
          currentUserName={authSession.nickname || authSession.username}
          onLogout={() => void handleLogout()}
        />
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
