import type { Metadata } from 'next';
import AuthPreview from '@/components/auth-preview';

export const metadata: Metadata = {
  title: '注册 · 页面框架',
};

export default function Page() {
  return <AuthPreview mode="signup" />;
}
