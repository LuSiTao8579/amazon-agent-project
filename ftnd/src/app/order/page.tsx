import type { Metadata } from 'next';
import AuthenticatedWorkspace from '@/components/authenticated-workspace';

export const metadata: Metadata = {
  title: 'Order · 页面框架',
};

export default function Page() {
  return <AuthenticatedWorkspace section="order" />;
}
