"use client";

import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import type { ProColumns } from "@ant-design/pro-components";
import dayjs from "dayjs";
import { Button, Popconfirm, Tag, Tooltip } from "antd";

import type { RoleRecord } from "../_lib/roles";

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("YYYY-MM-DD HH:mm:ss") : value;
}

export function getRoleColumns(
  onEdit: (record: RoleRecord) => void,
  onDelete: (record: RoleRecord) => void,
  isDeleting: (record: RoleRecord) => boolean,
): ProColumns<RoleRecord>[] {
  return [
    {
      title: "角色名称",
      dataIndex: "role_name",
      width: 180,
      ellipsis: true,
    },
    {
      title: "角色编码",
      dataIndex: "role_code",
      width: 160,
    },
    {
      title: "关联用户数",
      dataIndex: "user_count",
      width: 140,
      valueType: "digit",
    },
    {
      title: "状态",
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
      title: "操作",
      valueType: "option",
      width: 84,
      fixed: "right",
      search: false,
      render: (_, record) => [
        <Tooltip key="edit" title="编辑">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => onEdit(record)}
          />
        </Tooltip>,
        <Popconfirm
          key="delete"
          title="确认删除该角色？"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true, loading: isDeleting(record) }}
          onConfirm={() => onDelete(record)}
        >
          <Tooltip title="删除">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={isDeleting(record)}
            />
          </Tooltip>
        </Popconfirm>,
      ],
    },
  ];
}
