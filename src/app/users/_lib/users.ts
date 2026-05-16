export type UserRecord = {
  id: string;
  username: string;
  nickname: string;
  role_id: string | null;
  role_name: string | null;
  phone: string | null;
  email: string | null;
  status: "启用" | "停用";
  created_at: string | null;
  last_login_at: string | null;
};

export type UserCreateValues = {
  username: string;
  nickname: string;
  phone: string;
  role_id: string;
  email?: string;
  password?: string;
};

export type UserUpdateValues = UserCreateValues;

export const mockUserRecords: UserRecord[] = [
  {
    id: "1",
    username: "lybkj",
    nickname: "Bruce",
    role_id: "1",
    role_name: "系统管理员",
    phone: "19925199161",
    email: null,
    status: "启用",
    created_at: "2024-12-06 08:58:32",
    last_login_at: "2026-05-15 07:40:33",
  },
  {
    id: "2",
    username: "lybkjbella",
    nickname: "Bella",
    role_id: "2",
    role_name: "普通管理员",
    phone: "13750540170",
    email: null,
    status: "启用",
    created_at: "2024-12-13 21:46:31",
    last_login_at: "2026-05-14 22:34:33",
  },
];
