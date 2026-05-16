"use client";

import { App, Button, Form, Input, Modal, Select, Space } from "antd";
import { useEffect } from "react";

import type { UserCreateValues, UserRecord } from "../_lib/users";

type RoleOption = {
  label: string;
  value: string;
};

type UserCreateModalProps = {
  open: boolean;
  mode: "create" | "edit";
  record?: UserRecord;
  roleOptions: RoleOption[];
  onClose: () => void;
  onSubmit: (values: UserCreateValues) => Promise<void> | void;
};

const USERNAME_RULE = /^[A-Za-z0-9]+$/;
const PHONE_RULE = /^1\d{10}$/;
const PASSWORD_MIN_LENGTH = 6;

export default function UserCreateModal({
  open,
  mode,
  record,
  roleOptions,
  onClose,
  onSubmit,
}: UserCreateModalProps) {
  const [form] = Form.useForm<UserCreateValues>();
  const { message } = App.useApp();

  useEffect(() => {
    if (!open) {
      form.resetFields();
      return;
    }

    if (mode === "edit" && record) {
      form.setFieldsValue({
        username: record.username,
        nickname: record.nickname,
        phone: record.phone ?? "",
        role_id: record.role_id ?? undefined,
        email: record.email ?? undefined,
        password: "",
      });
      return;
    }

    form.resetFields();
  }, [form, mode, open, record]);

  function handleCancel() {
    form.resetFields();
    onClose();
  }

  async function handleFinish(values: UserCreateValues) {
    await onSubmit({
      ...values,
      email: values.email?.trim() || undefined,
      password: values.password?.trim() || undefined,
    });
    message.success(mode === "edit" ? "用户修改成功" : "用户新增成功");
    handleCancel();
  }

  return (
    <Modal
      title={mode === "edit" ? "编辑用户" : "添加用户"}
      open={open}
      onCancel={handleCancel}
      footer={null}
      destroyOnHidden
      width={1120}
      centered
    >
      <Form<UserCreateValues>
        form={form}
        layout="horizontal"
        labelCol={{ flex: "112px" }}
        wrapperCol={{ flex: "auto" }}
        colon={false}
        onFinish={(values) => void handleFinish(values)}
        onFinishFailed={() => message.error("请先完善必填信息")}
        className="pt-6"
      >
        <Form.Item
          label="用户账号"
          name="username"
          rules={[
            { required: true, message: "请输入用户账号" },
            {
              pattern: USERNAME_RULE,
              message:
                "请输入正确的账号格式，账号由英文字母或数字组成，请勿使用特殊符号如@&%-_等",
            },
          ]}
        >
          <Input
            size="large"
            maxLength={20}
            showCount
            placeholder="请输入用户账号，账号由英文字母或数字组成，请勿使用特殊符号如@&%-_等"
          />
        </Form.Item>

        <Form.Item
          label="用户昵称"
          name="nickname"
          rules={[
            { required: true, message: "请输入昵称" },
            { max: 10, message: "用户昵称最多输入10个字符" },
          ]}
        >
          <Input
            size="large"
            maxLength={10}
            showCount
            placeholder="最大输入10个字符，名称可输入中文、字母或数字"
          />
        </Form.Item>

        <Form.Item
          label="手机号码"
          name="phone"
          rules={[
            { required: true, message: "请输入手机号码" },
            { pattern: PHONE_RULE, message: "请输入正确的11位手机号码" },
          ]}
        >
          <Input size="large" maxLength={11} placeholder="请输入手机号码" />
        </Form.Item>

        <Form.Item
          label="用户类型"
          name="role_id"
          rules={[{ required: true, message: "请选择用户类型" }]}
        >
          <Select
            size="large"
            placeholder="请选择用户类型"
            options={roleOptions}
          />
        </Form.Item>

        <Form.Item
          label="邮箱"
          name="email"
          rules={[{ type: "email", message: "请输入正确的邮箱格式" }]}
        >
          <Input size="large" placeholder="请输入邮箱" />
        </Form.Item>

        <Form.Item
          label="登录密码"
          name="password"
          rules={[
            ...(mode === "create"
              ? [{ required: true, message: "请输入登录密码" }]
              : []),
            {
              validator: (_, value) => {
                if (!value) {
                  return Promise.resolve();
                }

                return value.length >= PASSWORD_MIN_LENGTH
                  ? Promise.resolve()
                  : Promise.reject(
                      new Error(`密码长度不能少于${PASSWORD_MIN_LENGTH}位`),
                    );
              },
            },
          ]}
          extra={mode === "edit" ? "留空则保持原密码不变" : undefined}
        >
          <Input.Password
            size="large"
            placeholder={
              mode === "edit" ? "请输入新密码，不填写则不修改" : "请输入登录密码"
            }
          />
        </Form.Item>

        <div className="flex justify-end pt-8">
          <Space size={20}>
            <Button size="large" onClick={handleCancel}>
              取消
            </Button>
            <Button size="large" type="primary" htmlType="submit">
              保存
            </Button>
          </Space>
        </div>
      </Form>
    </Modal>
  );
}
