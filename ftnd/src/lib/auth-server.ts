import 'server-only';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { errorMessage, isRecord, isPublicUser, publicUser } from './auth-contract';

export const SESSION_COOKIE = 'supply_chain_session';
const backendUrl = process.env.BACKEND_URL ?? 'http://127.0.0.1:3001';
const appOrigin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000';

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: new URL(appOrigin).protocol === 'https:',
    path: '/',
    maxAge,
  };
}

// Use the configured trusted origin, not an untrusted forwarded host header.
export function checkMutation(request: Request): NextResponse | null {
  if (request.headers.get('origin') !== new URL(appOrigin).origin ||
      request.headers.get('sec-fetch-site') === 'cross-site') {
    return json({ message: '请求来源不受信任，请从工作台页面重试' }, 403);
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return json({ message: '请求必须使用 JSON 格式' }, 415);
  }
  return null;
}

export async function backendFetch(path: '/auth/signup' | '/auth/login' | '/auth/me', init?: RequestInit) {
  return fetch(new URL(path, backendUrl), {
    ...init,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
}

export async function submitCredentials(request: Request, mode: 'signup' | 'login') {
  const rejected = checkMutation(request);
  if (rejected) return rejected;
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 8192) return json({ message: '请求内容过长' }, 413);
    body = JSON.parse(text);
    if (!isRecord(body)) return json({ message: '请输入邮箱和密码' }, 400);
  } catch {
    return json({ message: '请求不是有效的 JSON' }, 400);
  }

  try {
    const upstream = await backendFetch(`/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data: unknown = await upstream.json();
    if (!upstream.ok) {
      const expected = [400, 401, 409, 429].includes(upstream.status);
      return json({
        message: expected ? errorMessage(data, '请求未通过，请检查输入') : '认证服务暂时不可用，请稍后重试',
      }, expected ? upstream.status : 502);
    }
    if (!isRecord(data) || !isPublicUser(data.user)) throw new Error('Invalid auth response');

    if (mode === 'signup') {
      if (upstream.status !== 201 || typeof data.message !== 'string') throw new Error('Invalid signup response');
      return json({ message: data.message, user: publicUser(data.user) }, 201);
    }
    if (upstream.status !== 200 || typeof data.accessToken !== 'string' || !data.accessToken ||
        data.tokenType !== 'Bearer' || !Number.isInteger(data.expiresIn) ||
        typeof data.expiresIn !== 'number' || data.expiresIn <= 0) throw new Error('Invalid login response');
    const response = json({ user: publicUser(data.user) });
    response.cookies.set(SESSION_COOKIE, data.accessToken, cookieOptions(data.expiresIn));
    return response;
  } catch {
    // Do not log credentials, upstream bodies, or tokens.
    return json({ message: '无法连接认证服务或服务响应异常，请确认后端已启动后重试' }, 502);
  }
}

export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const response = await backendFetch('/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Authentication service unavailable');
  const user: unknown = await response.json();
  if (!isPublicUser(user)) throw new Error('Invalid user response');
  return publicUser(user);
}
