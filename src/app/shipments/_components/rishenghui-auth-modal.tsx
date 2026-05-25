"use client";

import { ReloadOutlined } from "@ant-design/icons";
import { App, Button, Input, Modal, Space } from "antd";
import { useCallback, useRef, useState } from "react";

type RishenghuiAuthModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: (accessToken: string) => void;
  onGetAccessToken: (values: { code: string; uuid: string }) => Promise<string>;
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

export default function RishenghuiAuthModal({
  open,
  onClose,
  onSaved,
  onGetAccessToken,
}: RishenghuiAuthModalProps) {
  const { message } = App.useApp();
  const [codeValue, setCodeValue] = useState("");
  const [authCodeImg, setAuthCodeImg] = useState("");
  const [authCodeUuid, setAuthCodeUuid] = useState("");
  const [authCodeLoading, setAuthCodeLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validCodeStatus, setValidCodeStatus] =
    useState<ValidCodeStatus>("idle");
  const validateTimerRef = useRef<number | undefined>(undefined);

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
      const payload = (await response
        .json()
        .catch(() => null)) as AuthCodeResponse | null;

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
        const payload = (await response
          .json()
          .catch(() => null)) as ValidCodeResponse | null;

        if (!response.ok) {
          throw new Error(payload?.error || "验证码校验失败");
        }

        setValidCodeStatus(payload?.valid ? "valid" : "invalid");
      } catch (error) {
        setValidCodeStatus("invalid");
        message.error(
          error instanceof Error ? error.message : "验证码校验失败",
        );
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

  function resetState() {
    setCodeValue("");
    setAuthCodeImg("");
    setAuthCodeUuid("");
    setSubmitting(false);
    clearValidateTimer();
    setValidCodeStatus("idle");
  }

  async function handleSubmit() {
    const code = codeValue.trim();
    if (!authCodeUuid) {
      message.error("请先获取验证码图片");
      return;
    }

    if (!code) {
      message.error("请输入验证码");
      return;
    }

    if (validCodeStatus !== "valid") {
      message.error("请先输入正确的验证码");
      return;
    }

    try {
      setSubmitting(true);
      const token = await onGetAccessToken({ code, uuid: authCodeUuid });
      onSaved(token);
      message.success("日升辉登录成功");
      resetState();
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "日升辉登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    resetState();
    onClose();
  }

  function handleOpenChange(visible: boolean) {
    if (visible) {
      void loadAuthCode();
    }
  }

  return (
    <Modal
      title="日升辉登录"
      open={open}
      width={520}
      destroyOnHidden
      maskClosable={false}
      onCancel={handleClose}
      afterOpenChange={handleOpenChange}
      footer={
        <div className="flex justify-end">
          <Space>
            <Button onClick={handleClose}>取消</Button>
            <Button
              type="primary"
              loading={submitting}
              disabled={validCodeStatus !== "valid"}
              onClick={() => void handleSubmit()}
            >
              获取Token
            </Button>
          </Space>
        </div>
      }
    >
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
    </Modal>
  );
}
