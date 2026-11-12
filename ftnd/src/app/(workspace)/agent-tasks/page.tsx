import type { Metadata } from 'next';
import AgentTasks from '@/components/agent-tasks';
import { requireUser } from '@/lib/auth-server';

export const metadata: Metadata = { title: 'Agent Tasks · 任务进度' };

export default async function Page() {
  // 与其他工作台页面一样，每次访问都校验当前登录用户。
  await requireUser();
  return <AgentTasks />;
}
