"use client";

import type { ActionType } from "@ant-design/pro-components";
import { ExclamationCircleFilled } from "@ant-design/icons";
import { App, ConfigProvider, Modal, message } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useEffect, useRef, useState } from "react";

import { requestRoleOptions } from "../../roles/_lib/roles-request";
import UserCreateModal from "./user-create-modal";
import UsersTable from "./users-table";
import type { UserCreateValues, UserRecord } from "../_lib/users";
import {
  createUserRecord,
  deleteUserRecord,
  updateUserRecord,
} from "../_lib/users-request";

dayjs.locale("zh-cn");

export default function UsersPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<UserRecord | undefined>();
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [roleOptions, setRoleOptions] = useState<
    Array<{ label: string; value: string }>
  >([]);
  const [messageApi, contextHolder] = message.useMessage();
  const [modalApi, modalContextHolder] = Modal.useModal();
  const tableActionRef = useRef<ActionType>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function loadRoleOptions() {
      try {
        const roles = await requestRoleOptions();
        if (cancelled) return;

        setRoleOptions(
          roles.map((item) => ({
            label: item.role_name,
            value: item.id,
          })),
        );
      } catch (error) {
        if (cancelled) return;

        const description =
          error instanceof Error ? error.message : "角色列表读取失败";
        messageApi.error(`角色数据加载失败：${description}`);
        setRoleOptions([]);
      }
    }

    void loadRoleOptions();

    return () => {
      cancelled = true;
    };
  }, [messageApi]);

  async function handleCreate(values: UserCreateValues) {
    try {
      await createUserRecord(values);
      setCreateOpen(false);
      tableActionRef.current?.reload();
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "请检查数据库权限或字段内容";
      messageApi.error(`用户新增失败：${description}`);
      throw error;
    }
  }

  async function handleEdit(values: UserCreateValues) {
    if (!editingRecord) return;

    try {
      await updateUserRecord(editingRecord.id, values);
      setEditOpen(false);
      setEditingRecord(undefined);
      tableActionRef.current?.reload();
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "请检查数据库权限或字段内容";
      messageApi.error(`用户修改失败：${description}`);
      throw error;
    }
  }

  function isDeleting(record: UserRecord) {
    return deletingUserId === record.id;
  }

  function handleDelete(record: UserRecord) {
    modalApi.confirm({
      title: "提示",
      icon: <ExclamationCircleFilled className="!text-amber-500" />,
      content: "此操作将永久删除该用户，是否继续？",
      okText: "确定",
      cancelText: "取消",
      centered: true,
      onOk: async () => {
        try {
          setDeletingUserId(record.id);
          await deleteUserRecord(record.id);
          messageApi.success("用户删除成功");
          tableActionRef.current?.reload();
        } catch (error) {
          const description =
            error instanceof Error ? error.message : "请检查数据库权限或字段内容";
          messageApi.error(`用户删除失败：${description}`);
          throw error;
        } finally {
          setDeletingUserId(null);
        }
      },
    });
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
        {modalContextHolder}
        <main className="h-full overflow-auto bg-slate-100 px-6 py-6">
          <section className="mx-auto flex max-w-[1600px] flex-col gap-4">
            <UsersTable
              actionRef={tableActionRef}
              onCreate={() => setCreateOpen(true)}
              onEdit={(record) => {
                setEditingRecord(record);
                setEditOpen(true);
              }}
              onDelete={(record) => void handleDelete(record)}
              isDeleting={isDeleting}
            />
          </section>
        </main>
        {createOpen ? (
          <UserCreateModal
            open={createOpen}
            mode="create"
            roleOptions={roleOptions}
            onClose={() => setCreateOpen(false)}
            onSubmit={(values) => void handleCreate(values)}
          />
        ) : null}
        {editOpen && editingRecord ? (
          <UserCreateModal
            open={editOpen}
            mode="edit"
            record={editingRecord}
            roleOptions={roleOptions}
            onClose={() => {
              setEditOpen(false);
              setEditingRecord(undefined);
            }}
            onSubmit={(values) => void handleEdit(values)}
          />
        ) : null}
      </App>
    </ConfigProvider>
  );
}
