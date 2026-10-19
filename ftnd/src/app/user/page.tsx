import type { Metadata } from 'next';
import WorkspacePreview from '@/components/workspace-preview';

export const metadata: Metadata = {
  title: 'User · 页面框架',
};

export default function Page() {
  return <WorkspacePreview section="user" />;
}
