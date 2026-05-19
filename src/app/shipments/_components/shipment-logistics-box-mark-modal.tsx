"use client";

import { ReloadOutlined } from "@ant-design/icons";
import { App, Button, Form, Input, Modal, Space } from "antd";
import { useCallback, useRef, useState } from "react";

import type { ShipmentRecord } from "../_lib/shipments";
import type { LogisticsProviderOption } from "../../logistics/_lib/logistics";

type ShipmentLogisticsBoxMarkModalProps = {
  open: boolean;
  record?: ShipmentRecord;
  logisticsOptions: LogisticsProviderOption[];
  onClose: () => void;
  onGenerate: (values: {
    record: ShipmentRecord;
    username: string;
    password: string;
    code: string;
    uuid: string;
  }) => void;
};

type LogisticsBoxMarkFormValues = {
  username: string;
  password: string;
  code: string;
};

type AuthCodeResponse = {
  img?: string;
  uuid?: string;
  error?: string;
};

type ValidCodeResponse = {
  valid?: boolean;
  error?: string;
};

type ValidCodeStatus = "idle" | "validating" | "valid" | "invalid";

function findLogisticsProvider(
  record: ShipmentRecord | undefined,
  logisticsOptions: LogisticsProviderOption[],
) {
  const providerName = record?.logistics_provider?.trim();
  if (!providerName) return undefined;

  return logisticsOptions.find(
    (item) => item.provider_name?.trim() === providerName,
  );
}

export default function ShipmentLogisticsBoxMarkModal({
  open,
  record,
  logisticsOptions,
  onClose,
  onGenerate,
}: ShipmentLogisticsBoxMarkModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<LogisticsBoxMarkFormValues>();
  const [authCodeImg, setAuthCodeImg] = useState("");
  const [authCodeUuid, setAuthCodeUuid] = useState("");
  const [authCodeLoading, setAuthCodeLoading] = useState(false);
  const [validCodeStatus, setValidCodeStatus] =
    useState<ValidCodeStatus>("idle");
  const validateTimerRef = useRef<number | undefined>(undefined);
  const provider = findLogisticsProvider(record, logisticsOptions);

  function clearValidateTimer() {
    if (validateTimerRef.current) {
      window.clearTimeout(validateTimerRef.current);
      validateTimerRef.current = undefined;
    }
  }

  const loadAuthCode = useCallback(async () => {
    try {
      setAuthCodeLoading(true);
      const response = await fetch("/api/logistics/rishenghui/auth-code", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | AuthCodeResponse
        | null;

      if (!response.ok || !payload?.img || !payload.uuid) {
        throw new Error(payload?.error || "验证码获取失败");
      }

      setAuthCodeImg(payload.img);
      setAuthCodeUuid(payload.uuid);
      form.setFieldValue("code", "");
      clearValidateTimer();
      setValidCodeStatus("idle");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "验证码获取失败");
      setAuthCodeImg("");
      setAuthCodeUuid("");
      clearValidateTimer();
      setValidCodeStatus("idle");
    } finally {
      setAuthCodeLoading(false);
    }
  }, [form, message]);

  const validateAuthCode = useCallback(
    async (code: string, uuid: string) => {
      try {
        setValidCodeStatus("validating");
        const params = new URLSearchParams({ uuid, code });
        const response = await fetch(
          `/api/logistics/rishenghui/valid-code?${params}`,
          { cache: "no-store" },
        );
        const payload = (await response.json().catch(() => null)) as
          | ValidCodeResponse
          | null;

        if (!response.ok) {
          throw new Error(payload?.error || "验证码校验失败");
        }

        if (!payload?.valid) {
          setValidCodeStatus("invalid");
          return;
        }

        setValidCodeStatus("valid");
      } catch (error) {
        setValidCodeStatus("invalid");
        message.error(error instanceof Error ? error.message : "验证码校验失败");
      }
    },
    [message],
  );

  function scheduleValidateAuthCode(value: string) {
    const code = value.trim();
    clearValidateTimer();

    if (!code || !authCodeUuid) {
      setValidCodeStatus("idle");
      return;
    }

    setValidCodeStatus("idle");
    validateTimerRef.current = window.setTimeout(() => {
      void validateAuthCode(code, authCodeUuid);
    }, 500);
  }

  function handleClose() {
    form.resetFields();
    setAuthCodeImg("");
    setAuthCodeUuid("");
    clearValidateTimer();
    setValidCodeStatus("idle");
    onClose();
  }

  async function handleSubmit() {
    const values = await form.validateFields();

    if (!authCodeUuid) {
      message.error("请先获取验证码图片");
      return;
    }

    if (validCodeStatus !== "valid") {
      message.error("请先输入正确的验证码");
      return;
    }

    if (!record?.id) {
      message.error("缺少货件ID");
      return;
    }

    onGenerate({
      record,
      username: values.username,
      password: values.password,
      code: values.code,
      uuid: authCodeUuid,
    });
    handleClose();
  }

  return (
    <Modal
      title={null}
      open={open}
      width={560}
      destroyOnHidden
      maskClosable={false}
      onCancel={handleClose}
      afterOpenChange={(visible) => {
        if (visible) {
          void loadAuthCode();
        }
      }}
      footer={
        <div className="flex justify-end">
          <Space>
            <Button onClick={handleClose}>取消</Button>
            <Button
              type="primary"
              disabled={validCodeStatus !== "valid"}
              onClick={() => void handleSubmit()}
            >
              生成箱唛
            </Button>
          </Space>
        </div>
      }
    >
      <Form<LogisticsBoxMarkFormValues>
        form={form}
        layout="vertical"
        initialValues={{
          username: provider?.username?.trim() ?? "",
          password: provider?.password?.trim() ?? "",
          code: "",
        }}
      >
        <Form.Item
          label="用户名"
          name="username"
          rules={[{ required: true, message: "请输入用户名" }]}
        >
          <Input placeholder="请输入用户名" />
        </Form.Item>
        <Form.Item
          label="密码"
          name="password"
          rules={[{ required: true, message: "请输入密码" }]}
        >
          <Input.Password placeholder="请输入密码" />
        </Form.Item>
        <Form.Item
          label="验证码"
          name="code"
          rules={[{ required: true, message: "请输入验证码" }]}
          validateStatus={
            validCodeStatus === "validating"
              ? "validating"
              : validCodeStatus === "valid"
                ? "success"
                : validCodeStatus === "invalid"
                  ? "error"
                  : undefined
          }
          help={validCodeStatus === "invalid" ? "验证码错误" : undefined}
        >
          <Space.Compact className="!flex">
            <Input
              placeholder="请输入验证码"
              onChange={(event) =>
                scheduleValidateAuthCode(event.target.value)
              }
            />
            <div className="flex h-8 min-w-32 items-center justify-center border border-l-0 border-slate-200 bg-white px-2">
              {authCodeImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={authCodeImg}
                  alt="验证码"
                  className="h-7 max-w-28 object-contain"
                />
              ) : null}
            </div>
            <Button
              icon={<ReloadOutlined />}
              loading={authCodeLoading}
              onClick={() => void loadAuthCode()}
            />
          </Space.Compact>
        </Form.Item>
      </Form>
    </Modal>
  );
}
