import { Chip, TableCell } from '@mui/material';
import type { UserRow } from '../../../contracts/tool-result.d.ts';

export const userColumns = ['姓名', '邮箱', '岗位', '状态'];

export default function UserTableCells({ user }: { user: UserRow }) {
  const active = user.status === 'active';
  return <>
    <TableCell>{user.name || '未设置'}</TableCell>
    <TableCell>{user.email}</TableCell>
    <TableCell>{user.role || '未设置'}</TableCell>
    <TableCell><Chip label={active ? '启用' : '停用'} color={active ? 'success' : 'default'} /></TableCell>
  </>;
}
