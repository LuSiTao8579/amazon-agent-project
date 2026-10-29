import type { Metadata } from 'next';
import ManagementTable from '@/components/management-table';
import { requireUser } from '@/lib/auth-server';

export const metadata: Metadata = {
  title: 'Company · 供应链公司',
};

export default async function Page() {
  const user = await requireUser();
  return <ManagementTable kind="companies" isAdmin={user.isAdmin === true} />;
}
