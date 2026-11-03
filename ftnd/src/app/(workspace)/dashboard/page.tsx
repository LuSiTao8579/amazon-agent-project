import type { Metadata } from 'next';
import Dashboard from '@/components/dashboard';
import { requireUser } from '@/lib/auth-server';

export const metadata: Metadata = {
  title: 'Dashboard · 数据总览',
};

export default async function Page() {
  await requireUser();
  return <Dashboard />;
}
