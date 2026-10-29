import type { Metadata } from 'next';
import ManagementTable from '@/components/management-table';
import { requireUser } from '@/lib/auth-server';

export const metadata: Metadata = {
  title: 'User · 用户与账户',
};

export default async function Page() {
  const user = await requireUser();
  return <ManagementTable kind="users" isAdmin={user.isAdmin === true} />;
}
