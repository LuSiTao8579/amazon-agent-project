import { cookies } from 'next/headers';
import { json, SESSION_COOKIE } from '@/lib/auth-server';
import { isRecord } from '@/lib/auth-contract';
import { normalizeMessage } from '@/features/ai-chat/normalize-message';
import type { ChatMessage } from '@/features/ai-chat/types';

// 仅供当前登录用户读取最近会话；Token只留在服务端，返回白名单字段。
export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return json({ message: '请先登录' }, 401);
  const base = process.env.BACKEND_URL ?? 'http://127.0.0.1:3001';
  const signal = AbortSignal.timeout(10000);
  async function get(path: string) {
    const response = await fetch(new URL(path, base), { headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store', redirect: 'error', signal });
    if (response.status === 401) return { unauthorized: true as const, data: null };
    if (!response.ok) throw new Error('后端请求失败');
    return { unauthorized: false as const, data: await response.json() as unknown };
  }
  try {
    const sessions = await get('/ai-agent/sessions?page=1&pageSize=1');
    if (sessions.unauthorized) return json({ message: '登录已失效，请重新登录' }, 401);
    if (!isRecord(sessions.data) || !Array.isArray(sessions.data.items)) throw new Error('会话响应格式错误');
    if (sessions.data.items.length === 0) return json({ session: null, messages: [], hasMore: false });
    const session: unknown = sessions.data.items[0];
    if (!isRecord(session) || typeof session.id !== 'string' ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(session.id) ||
      typeof session.title !== 'string') throw new Error('会话格式错误');

    const messages: ChatMessage[] = [];
    let hasMore = true;
    // 防止一次请求无界读取；长会话保留在数据库中，后续分页功能可完整加载。
    for (let page = 1; page <= 10 && hasMore; page++) {
      const response = await get(`/ai-agent/sessions/${session.id}/messages?page=${page}&pageSize=100`);
      if (response.unauthorized) return json({ message: '登录已失效，请重新登录' }, 401);
      if (!isRecord(response.data) || !Array.isArray(response.data.items) ||
          typeof response.data.hasMore !== 'boolean') throw new Error('消息响应格式错误');
      for (const row of response.data.items as unknown[]) {
        messages.push(normalizeMessage(row));
      }
      hasMore = response.data.hasMore;
    }
    return json({ session: { id: session.id, title: session.title }, messages, hasMore });
  } catch {
    return json({ message: '无法加载会话，请确认后端服务已启动' }, 502);
  }
}
