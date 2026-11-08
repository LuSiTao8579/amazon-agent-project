import { cookies } from 'next/headers';
import { checkMutation, json, SESSION_COOKIE } from '@/lib/auth-server';
import { errorMessage, isRecord } from '@/lib/auth-contract';
import { MAX_ATTACHMENT_BYTES } from '@/features/ai-chat/upload-policy';

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const maxFile = MAX_ATTACHMENT_BYTES;
const base = process.env.BACKEND_URL ?? 'http://127.0.0.1:3001';
type Context = { params: Promise<{ path: string[] }> };

/** 读取时限制总字节数，不能只信任浏览器发送的 Content-Length。 */
async function boundedBody(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error('too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(new ArrayBuffer(size)); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
function target(path: string[], method: string) {
  if (path.length === 1 && path[0] === 'sessions' && method === 'POST') return 'sessions';
  if (path[0] !== 'sessions' || !uuid.test(path[1] ?? '')) return null;
  if (path.length === 3 && method === 'POST' && ['turns','attachments'].includes(path[2])) return path[2];
  if (path.length === 4 && path[2] === 'attachments' && uuid.test(path[3]) && method === 'GET') return 'download';
  return null;
}
async function handle(request: Request, context: Context) {
  const { path } = await context.params;
  const kind = target(path, request.method);
  if (!kind) return json({ message: '接口不存在' }, 404);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return json({ message: '请先登录' }, 401);
  const contentType = request.headers.get('content-type') ?? '';
  if (request.method === 'POST') {
    if (kind === 'attachments') {
      const origin = new URL(process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000').origin;
      if (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site')
        return json({ message: '请求来源不受信任' }, 403);
      if (!/^multipart\/form-data;\s*boundary=/i.test(contentType)) return json({ message: '文件上传格式不正确' }, 415);
    } else {
      const rejected = checkMutation(request);
      if (rejected) return rejected;
    }
  }
  try {
    let body: BodyInit | undefined;
    const headers: Record<string,string> = { Authorization: `Bearer ${token}` };
    if (kind === 'attachments') {
      const bytes = await boundedBody(request, maxFile + 65536);
      const form = await new Response(bytes, { headers: { 'Content-Type': contentType } }).formData();
      const file = form.get('file');
      if (!(file instanceof File) || [...form.keys()].length !== 1 || file.size < 1 || file.size > maxFile)
        return json({ message: '请选择不超过 5 MB 的非空文件' }, 400);
      const forward = new FormData(); forward.append('file', file, file.name); body = forward;
    } else if (request.method === 'POST') {
      const bytes = await boundedBody(request, 32768);
      body = new TextDecoder().decode(bytes); headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(new URL('/ai-agent/' + path.join('/'), base), {
      method: request.method, headers, body, cache: 'no-store', redirect: 'error',
      signal: AbortSignal.timeout(kind === 'turns' ? 120000 : 15000),
    });
    if (kind === 'download' && response.ok) {
      return new Response(response.body, { status: 200, headers: {
        'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': response.headers.get('Content-Disposition') ?? 'attachment',
      }});
    }
    const data: unknown = await response.json();
    if (!response.ok) return json({
      message: response.status < 500 ? errorMessage(data, '操作失败') : '服务暂时不可用，请稍后重试',
      ...(isRecord(data) && data.status === 'failed' ? { status: 'failed' } : {}),
    }, response.status);
    if (kind === 'sessions' && isRecord(data) && typeof data.id === 'string' && uuid.test(data.id) && typeof data.title === 'string')
      return json({ id: data.id, title: data.title }, response.status);
    if (kind === 'turns' && isRecord(data) && data.status === 'completed') return json({ status: 'completed' }, response.status);
    if (kind === 'attachments' && isRecord(data) && typeof data.messageId === 'string') return json({ uploaded: true }, response.status);
    throw new Error('invalid response');
  } catch (error) {
    if (error instanceof Error && error.message === 'too large') return json({ message: '请求超过大小限制' }, 413);
    return json({ message: '连接后端失败或响应异常，请稍后重试' }, 502);
  }
}
export { handle as GET, handle as POST };
