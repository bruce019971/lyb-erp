"use client";

import { ReloadOutlined } from "@ant-design/icons";
import { App, Button, Input, Modal, Space } from "antd";
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
  const [usernameValue, setUsernameValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [codeValue, setCodeValue] = useState("");
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
      setCodeValue("");
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
  }, [message]);

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
    setUsernameValue("");
    setPasswordValue("");
    setCodeValue("");
    setAuthCodeImg("");
    setAuthCodeUuid("");
    clearValidateTimer();
    setValidCodeStatus("idle");
    onClose();
  }

  function handleSubmit() {
    const username = usernameValue.trim();
    const password = passwordValue.trim();
    const code = codeValue.trim();

    if (!username) {
      message.error("请输入用户名");
      return;
    }

    if (!password) {
      message.error("请输入密码");
      return;
    }

    if (!code) {
      message.error("请输入验证码");
      return;
    }

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
      username,
      password,
      code,
      uuid: authCodeUuid,
    });
    handleClose();
  }

  function handleOpenChange(visible: boolean) {
    if (!visible) return;
    setUsernameValue(provider?.username?.trim() ?? "");
    setPasswordValue(provider?.password?.trim() ?? "");
    setCodeValue("");
    void loadAuthCode();
  }

  return (
    <Modal
      title={null}
      open={open}
      width={520}
      destroyOnHidden
      maskClosable={false}
      closable={false}
      onCancel={handleClose}
      afterOpenChange={handleOpenChange}
      footer={
        <div className="flex justify-end">
          <Space>
            <Button onClick={handleClose}>取消</Button>
            <Button
              type="primary"
              disabled={validCodeStatus !== "valid"}
              onClick={handleSubmit}
            >
              生成箱唛
            </Button>
          </Space>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <label className="w-16 shrink-0 pt-1.5 text-sm text-slate-700">
            验证码
          </label>
          <div className="min-w-0 flex-1">
            <Space.Compact className="!flex">
              <Input
                value={codeValue}
                status={validCodeStatus === "invalid" ? "error" : undefined}
                placeholder="请输入验证码"
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setCodeValue(nextValue);
                  scheduleValidateAuthCode(nextValue);
                }}
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
            {validCodeStatus === "invalid" ? (
              <div className="mt-1 text-sm text-red-500">验证码错误</div>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}
