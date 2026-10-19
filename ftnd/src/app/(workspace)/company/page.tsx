import type { Metadata } from 'next';
import WorkspacePageContent from '@/components/workspace-page-content';
import { requireUser } from '@/lib/auth-server';

export const metadata: Metadata = {
  title: 'Company · 供应链公司',
};

export default async function Page() {
  const user = await requireUser();
  return <WorkspacePageContent section="company" user={user} />;
}
