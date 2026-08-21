export type RoleRecord = {
  id: string;
  role_name: string;
  role_code: string;
  data_scope: string | null;
  menu_permissions: string[];
  user_count: number;
  status: "启用" | "停用";
  created_at: string | null;
};

export type RoleOption = {
  id: string;
  role_name: string;
};

export type RoleCreateValues = {
  role_name: string;
  status: "启用" | "停用";
  menu_permissions: string[];
};

export type RoleUpdateValues = RoleCreateValues;

export const mockRoleRecords: RoleRecord[] = [
  {
    id: "1",
    role_name: "系统管理员",
    role_code: "admin",
    data_scope: "全部数据权限",
    menu_permissions: [
      "core",
      "products",
      "shipments",
      "stores",
      "logistics",
      "relabels",
      "freights",
      "damages",
      "shipment_tracks",
      "system",
      "users",
      "roles",
    ],
    user_count: 1,
    status: "启用",
    created_at: "2024-12-06 08:58:32",
  },
  {
    id: "2",
    role_name: "普通管理员",
    role_code: "manager",
    data_scope: "业务数据权限",
    menu_permissions: [
      "core",
      "products",
      "shipments",
      "stores",
      "logistics",
      "relabels",
      "freights",
      "damages",
      "shipment_tracks",
    ],
    user_count: 1,
    status: "启用",
    created_at: "2024-12-13 21:46:31",
  },
];
