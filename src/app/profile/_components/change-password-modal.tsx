"use client";

import { App, Button, Form, Input, Modal, Space } from "antd";

type ChangePasswordValues = {
  currentPassword: string;
  nextPassword: string;
  confirmPassword: string;
};

type ChangePasswordModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: ChangePasswordValues) => Promise<void> | void;
};

export default function ChangePasswordModal({
  open,
  onClose,
  onSubmit,
}: ChangePasswordModalProps) {
  const [form] = Form.useForm<ChangePasswordValues>();
  const { message } = App.useApp();

  async function handleFinish(values: ChangePasswordValues) {
    await onSubmit(values);
    message.success("密码修改成功");
    form.resetFields();
    onClose();
  }

  return (
    <Modal
      title="修改密码"
      open={open}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      footer={null}
      destroyOnHidden
      width={520}
      centered
    >
      <Form<ChangePasswordValues>
        form={form}
        layout="vertical"
        onFinish={(values) => void handleFinish(values)}
        onFinishFailed={() => message.error("请先完善密码信息")}
        className="pt-4"
      >
        <Form.Item
          label="当前密码"
          name="currentPassword"
          rules={[{ required: true, message: "请输入当前密码" }]}
        >
          <Input.Password size="large" placeholder="请输入当前密码" />
        </Form.Item>

        <Form.Item
          label="新密码"
          name="nextPassword"
          rules={[
            { required: true, message: "请输入新密码" },
            { min: 6, message: "新密码长度不能少于6位" },
          ]}
        >
          <Input.Password size="large" placeholder="请输入新密码" />
        </Form.Item>

        <Form.Item
          label="确认新密码"
          name="confirmPassword"
          dependencies={["nextPassword"]}
          rules={[
            { required: true, message: "请再次输入新密码" },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue("nextPassword") === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error("两次输入的密码不一致"));
              },
            }),
          ]}
        >
          <Input.Password size="large" placeholder="请再次输入新密码" />
        </Form.Item>

        <div className="flex justify-end pt-4">
          <Space size={12}>
            <Button
              size="large"
              onClick={() => {
                form.resetFields();
                onClose();
              }}
            >
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
