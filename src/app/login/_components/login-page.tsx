"use client";

import { LockOutlined, UserOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  ConfigProvider,
  Form,
  Input,
  Typography,
  message,
} from "antd";
import zhCN from "antd/locale/zh_CN";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getStoredAuthSession, setStoredAuthSession } from "@/lib/auth";
import { requestLoginUser } from "../../users/_lib/users-request";

type LoginValues = {
  username: string;
  password: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    const session = getStoredAuthSession();
    if (session) {
      router.replace("/shipments");
    }
  }, [router]);

  async function handleFinish(values: LoginValues) {
    try {
      setSubmitting(true);
      const session = await requestLoginUser(values.username, values.password);
      setStoredAuthSession(session);
      messageApi.success("登录成功");
      router.replace("/shipments");
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "用户账号或密码错误";
      messageApi.error(description);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          borderRadius: 8,
          colorPrimary: "#1677ff",
        },
      }}
    >
      <App>
        {contextHolder}
        <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10">
          <Card
            variant="borderless"
            className="w-full max-w-[460px] shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
          >
            <div className="mb-8 text-center">
              <Typography.Title level={2} className="!mb-2">
                玲伊贝ERP
              </Typography.Title>
              <Typography.Text type="secondary">
                跨境电商管理系统
              </Typography.Text>
            </div>

            <Form<LoginValues>
              layout="vertical"
              onFinish={(values) => void handleFinish(values)}
            >
              <Form.Item
                label="用户账号"
                name="username"
                rules={[{ required: true, message: "请输入用户账号" }]}
              >
                <Input
                  size="large"
                  prefix={<UserOutlined />}
                  placeholder="请输入用户账号"
                  disabled={submitting}
                />
              </Form.Item>

              <Form.Item
                label="密码"
                name="password"
                rules={[{ required: true, message: "请输入密码" }]}
              >
                <Input.Password
                  size="large"
                  prefix={<LockOutlined />}
                  placeholder="请输入密码"
                  disabled={submitting}
                />
              </Form.Item>

              <Button
                type="primary"
                htmlType="submit"
                size="large"
                block
                loading={submitting}
                disabled={submitting}
              >
                登录
              </Button>
            </Form>
          </Card>
        </main>
      </App>
    </ConfigProvider>
  );
}
