"use client";

import { App, ConfigProvider, Skeleton, Typography, message } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useEffect, useState } from "react";

import type { CurrentUserProfile } from "../_lib/profile";
import {
  requestCurrentUserProfile,
  updateCurrentUserPassword,
} from "../_lib/profile-request";
import ChangePasswordModal from "./change-password-modal";

dayjs.locale("zh-cn");

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("YYYY-MM-DD HH:mm:ss") : value;
}

function ProfileField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-start gap-4 py-6">
      <Typography.Text className="!text-[18px] !font-semibold !text-slate-500">
        {label}
      </Typography.Text>
      <div className="min-w-0 text-[18px] leading-8 text-slate-800">{value}</div>
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        setLoading(true);
        const data = await requestCurrentUserProfile();
        if (cancelled) return;
        setProfile(data);
      } catch (error) {
        if (cancelled) return;
        const description =
          error instanceof Error ? error.message : "个人信息读取失败";
        messageApi.error(description);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [messageApi]);

  async function handlePasswordSubmit(values: {
    currentPassword: string;
    nextPassword: string;
  }) {
    try {
      await updateCurrentUserPassword(values.currentPassword, values.nextPassword);
      setProfile((current) =>
        current
          ? {
              ...current,
              passwordSet: true,
            }
          : current,
      );
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "密码修改失败，请稍后重试";
      messageApi.error(description);
      throw error;
    }
  }

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          borderRadius: 6,
          colorPrimary: "#1677ff",
        },
      }}
    >
      <App>
        {contextHolder}
        <main className="h-full overflow-auto bg-slate-100 px-6 py-6">
          <section className="mx-auto max-w-[1600px] bg-white">
            <div className="border-b border-slate-200 px-8 pt-6">
              <div className="flex items-end">
                <div className="border-b-2 border-[#1677ff] pb-4 text-[20px] font-medium text-[#1677ff]">
                  个人中心
                </div>
              </div>
            </div>

            <div className="px-20 py-10">
              {loading ? (
                <div className="space-y-8">
                  <Skeleton active paragraph={{ rows: 6 }} />
                </div>
              ) : profile ? (
                <div className="max-w-[900px]">
                  <ProfileField label="账号：" value={profile.username} />
                  <ProfileField label="账号类型：" value={profile.roleName || "-"} />
                  <ProfileField label="昵称：" value={profile.nickname || "-"} />
                  <ProfileField label="手机号：" value={profile.phone || "-"} />
                  <ProfileField
                    label="密码："
                    value={
                      <div className="flex flex-wrap items-center gap-3">
                        <span>
                          {profile.passwordSet
                            ? "已设置，可通过账户密码登录"
                            : "未设置，请尽快设置登录密码"}
                        </span>
                        <button
                          type="button"
                          className="cursor-pointer border-0 bg-transparent p-0 text-[#4096ff]"
                          onClick={() => setPasswordModalOpen(true)}
                        >
                          更改 &gt;
                        </button>
                      </div>
                    }
                  />
                  <ProfileField
                    label="最近登录："
                    value={formatDateTime(profile.lastLoginAt) || "-"}
                  />
                  <ProfileField
                    label="注册时间："
                    value={formatDateTime(profile.createdAt) || "-"}
                  />
                </div>
              ) : (
                <Typography.Text type="secondary">暂无个人信息</Typography.Text>
              )}
            </div>
          </section>
        </main>
        {passwordModalOpen ? (
          <ChangePasswordModal
            open={passwordModalOpen}
            onClose={() => setPasswordModalOpen(false)}
            onSubmit={(values) =>
              void handlePasswordSubmit({
                currentPassword: values.currentPassword,
                nextPassword: values.nextPassword,
              })
            }
          />
        ) : null}
      </App>
    </ConfigProvider>
  );
}
