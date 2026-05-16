export type CurrentUserProfile = {
  id: string;
  username: string;
  nickname: string;
  phone: string | null;
  roleName: string;
  passwordSet: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
};
