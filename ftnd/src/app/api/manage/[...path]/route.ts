import { cookies } from 'next/headers';
import { checkMutation, json, SESSION_COOKIE } from '@/lib/auth-server';
import { errorMessage } from '@/lib/auth-contract';

// 白名单代理：JWT只在服务端读取，不交给浏览器JavaScript。
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!['users', 'companies'].includes(path[0]) || path.length > 2 ||
      path.some(segment => !/^[A-Za-z0-9_-]+$/.test(segment))) return json({ message: '接口不存在' }, 404);
  if (request.method !== 'GET') {
    const rejected = checkMutation(request);
    if (rejected) return rejected;
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return json({ message: '请先登录' }, 401);
  try {
    const body = request.method === 'GET' ? undefined : await request.text();
    if (body && body.length > 32768) return json({ message: '请求过大' }, 413);
    const url = new URL('/' + path.join('/'), process.env.BACKEND_URL ?? 'http://127.0.0.1:3001');
    url.search = new URL(request.url).search;
    const response = await fetch(url, { method: request.method, body, cache: 'no-store',
      redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
    const data: unknown = await response.json();
    if (!response.ok) return json({ message: response.status < 500 ? errorMessage(data, '操作失败') : '服务暂时不可用' }, response.status < 500 ? response.status : 502);
    return json(data, response.status);
  } catch { return json({ message: '连接后端失败，请稍后重试' }, 502); }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
