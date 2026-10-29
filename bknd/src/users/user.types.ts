/** 可以返回给前端的用户信息：刻意不包含 password_hash。 */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: 'active' | 'inactive';
  isAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** 仅供登录校验使用的内部数据，不能直接作为接口响应返回。 */
export interface UserCredentials {
  id: string;
  email: string;
  passwordHash: string;
}

/** 与数据库 CHECK 约束一致：去掉首尾空白并转为小写。 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
