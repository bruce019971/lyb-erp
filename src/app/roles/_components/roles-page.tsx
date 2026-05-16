"use client";

import type { ActionType } from "@ant-design/pro-components";
import { App, ConfigProvider, message } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useEffect, useRef, useState } from "react";

import { getStoredAuthSession } from "@/lib/auth";
import RoleCreateModal from "./role-create-modal";
import RolesTable from "./roles-table";
import type { RoleCreateValues, RoleRecord } from "../_lib/roles";
import {
  createRoleRecord,
  deleteRoleRecord,
  updateRoleRecord,
} from "../_lib/roles-request";

dayjs.locale("zh-cn");

export default function RolesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RoleRecord | undefined>();
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);
  const [currentUserRoleId, setCurrentUserRoleId] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const tableActionRef = useRef<ActionType>(undefined);

  useEffect(() => {
    const session = getStoredAuthSession();
    setCurrentUserRoleId(session?.roleId ?? null);
  }, []);

  async function handleCreate(values: RoleCreateValues) {
    try {
      await createRoleRecord(values);
      setCreateOpen(false);
      tableActionRef.current?.reload();
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "请检查数据库权限或字段内容";
      messageApi.error(`角色新增失败：${description}`);
      throw error;
    }
  }

  async function handleEdit(values: RoleCreateValues) {
    if (!editingRecord) return;

    try {
      if (
        editingRecord.id === currentUserRoleId &&
        values.status !== editingRecord.status
      ) {
        throw new Error("当前用户所属角色的角色状态不可修改");
      }

      await updateRoleRecord(editingRecord.id, values);
      setEditOpen(false);
      setEditingRecord(undefined);
      tableActionRef.current?.reload();
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "请检查数据库权限或字段内容";
      messageApi.error(`角色修改失败：${description}`);
      throw error;
    }
  }

  async function handleDelete(record: RoleRecord) {
    try {
      setDeletingRoleId(record.id);
      await deleteRoleRecord(record.id);
      messageApi.success("角色删除成功");
      tableActionRef.current?.reload();
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "请检查数据库权限或字段内容";
      messageApi.error(`角色删除失败：${description}`);
    } finally {
      setDeletingRoleId(null);
    }
  }

  function isDeleting(record: RoleRecord) {
    return deletingRoleId === record.id;
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
          <section className="mx-auto flex max-w-[1600px] flex-col gap-4">
            <RolesTable
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
          <RoleCreateModal
            open={createOpen}
            mode="create"
            onClose={() => setCreateOpen(false)}
            onSubmit={(values) => void handleCreate(values)}
          />
        ) : null}
        {editOpen && editingRecord ? (
          <RoleCreateModal
            open={editOpen}
            mode="edit"
            record={editingRecord}
            disableStatusEdit={editingRecord.id === currentUserRoleId}
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
