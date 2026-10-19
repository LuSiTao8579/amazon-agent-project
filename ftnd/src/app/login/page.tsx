import type { Metadata } from 'next';
import AuthPreview from '@/components/auth-preview';

export const metadata: Metadata = {
  title: '登录 · 页面框架',
};

export default function Page() {
  return <AuthPreview mode="login" />;
}
