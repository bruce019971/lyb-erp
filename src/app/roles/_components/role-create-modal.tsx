"use client";

import { App, Button, Form, Input, Modal, Radio, Space, Tree } from "antd";
import { useEffect, useState } from "react";

import { menuPermissionTreeData } from "../../_components/navigation";
import type { RoleCreateValues, RoleRecord } from "../_lib/roles";

type RoleCreateModalProps = {
  open: boolean;
  mode: "create" | "edit";
  record?: RoleRecord;
  disableStatusEdit?: boolean;
  onClose: () => void;
  onSubmit: (values: RoleCreateValues) => Promise<void> | void;
};

export default function RoleCreateModal({
  open,
  mode,
  record,
  disableStatusEdit = false,
  onClose,
  onSubmit,
}: RoleCreateModalProps) {
  const [form] = Form.useForm<RoleCreateValues>();
  const [menuPermissions, setMenuPermissions] = useState<string[]>([]);
  const { message } = App.useApp();

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setMenuPermissions([]);
      return;
    }

    if (mode === "edit" && record) {
      form.setFieldsValue({
        role_name: record.role_name,
        status: record.status,
      });
      setMenuPermissions(record.menu_permissions ?? []);
      return;
    }

    form.setFieldsValue({
      status: "启用",
    });
    setMenuPermissions([]);
  }, [form, mode, open, record]);

  function handleCancel() {
    form.resetFields();
    onClose();
  }

  async function handleFinish(values: RoleCreateValues) {
    if (!menuPermissions.length) {
      message.error("请选择业务权限");
      return;
    }

    await onSubmit({
      ...values,
      role_name: values.role_name.trim(),
      menu_permissions: menuPermissions,
    });
    message.success(mode === "edit" ? "角色修改成功" : "角色新增成功");
    handleCancel();
  }

  return (
    <Modal
      title={mode === "edit" ? "编辑角色" : "添加角色"}
      open={open}
      onCancel={handleCancel}
      footer={null}
      destroyOnHidden
      width={1120}
      centered
    >
      <Form<RoleCreateValues>
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
          label="角色名称"
          name="role_name"
          rules={[
            { required: true, message: "请输入角色名称" },
            { max: 10, message: "角色名称最多输入10个字符" },
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
          label="角色状态"
          name="status"
          rules={[{ required: true, message: "请选择角色状态" }]}
          extra={
            disableStatusEdit ? "当前用户所属角色的角色状态不可修改" : undefined
          }
        >
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            className="role-status-group"
            disabled={disableStatusEdit}
          >
            <Radio.Button value="启用">启用</Radio.Button>
            <Radio.Button value="停用">停用</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          label="业务权限"
        >
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <Tree
              checkable
              defaultExpandAll
              treeData={menuPermissionTreeData}
              checkedKeys={menuPermissions}
              onCheck={(checkedKeysValue) => {
                const nextKeys = Array.isArray(checkedKeysValue)
                  ? checkedKeysValue.map((item) => String(item))
                  : checkedKeysValue.checked.map((item) => String(item));

                setMenuPermissions(nextKeys);
              }}
              className="role-permission-tree"
            />
          </div>
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
