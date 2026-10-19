import type { Metadata } from 'next';
import WorkspacePageContent from '@/components/workspace-page-content';
import { requireUser } from '@/lib/auth-server';

export const metadata: Metadata = {
  title: 'User · 用户与账户',
};

export default async function Page() {
  const user = await requireUser();
  return <WorkspacePageContent section="user" user={user} />;
}
