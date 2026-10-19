import type { Metadata } from 'next';
import Providers from './providers';

export const metadata: Metadata = {
  title: {
    default: '供应链工作台',
    template: '%s | 供应链工作台',
  },
  description: '供应链工作台：注册、登录与供应链业务入口。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
