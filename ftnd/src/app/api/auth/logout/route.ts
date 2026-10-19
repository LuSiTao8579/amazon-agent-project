import { checkMutation, cookieOptions, json, SESSION_COOKIE } from '@/lib/auth-server';

export async function POST(request: Request) {
  const rejected = checkMutation(request);
  if (rejected) return rejected;
  const response = json({ message: '已退出登录' });
  response.cookies.set(SESSION_COOKIE, '', cookieOptions(0));
  return response;
}
