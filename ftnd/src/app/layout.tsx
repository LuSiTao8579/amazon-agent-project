import type { Metadata } from 'next';
import Providers from './providers';

export const metadata: Metadata = {
  title: {
    default: '供应链工作台 · 页面框架',
    template: '%s | 供应链工作台',
  },
  description: '供应链工作台的注册、登录与业务页面原型，尚未接入认证 API。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
