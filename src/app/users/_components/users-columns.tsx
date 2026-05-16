"use client";

import type { ProColumns } from "@ant-design/pro-components";
import dayjs from "dayjs";
import { Button, Tag } from "antd";

import type { UserRecord } from "../_lib/users";

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("YYYY-MM-DD HH:mm:ss") : value;
}

export function getUserColumns(
  onEdit: (record: UserRecord) => void,
  onDelete: (record: UserRecord) => void,
  isDeleting: (record: UserRecord) => boolean,
): ProColumns<UserRecord>[] {
  return [
    {
      title: "用户账号",
      dataIndex: "username",
      width: 180,
      ellipsis: true,
    },
    {
      title: "用户昵称",
      dataIndex: "nickname",
      width: 180,
      ellipsis: true,
    },
    {
      title: "账号角色",
      dataIndex: "role_name",
      width: 180,
      ellipsis: true,
    },
    {
      title: "手机号码",
      dataIndex: "phone",
      width: 170,
    },
    {
      title: "账号状态",
      dataIndex: "status",
      width: 120,
      render: (_, record) =>
        record.status === "启用" ? (
          <Tag color="success" bordered={false}>
            启用
          </Tag>
        ) : (
          <Tag bordered={false}>停用</Tag>
        ),
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      width: 180,
      render: (_, record) => formatDateTime(record.created_at),
    },
    {
      title: "最后登录时间",
      dataIndex: "last_login_at",
      width: 190,
      render: (_, record) => formatDateTime(record.last_login_at),
    },
    {
      title: "操作",
      valueType: "option",
      width: 120,
      fixed: "right",
      search: false,
      render: (_, record) => [
        <Button
          key="edit"
          type="link"
          size="small"
          onClick={() => onEdit(record)}
        >
          编辑
        </Button>,
        <Button
          key="delete"
          type="link"
          size="small"
          danger
          loading={isDeleting(record)}
          onClick={() => onDelete(record)}
        >
          删除
        </Button>,
      ],
    },
  ];
}
