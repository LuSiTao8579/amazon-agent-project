import type { Metadata } from 'next';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'Agent 项目 · 前端环境验证',
  description: 'Next.js 和 Material UI v6 本地开发环境',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
