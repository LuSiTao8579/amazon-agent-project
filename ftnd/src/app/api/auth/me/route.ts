import { cookieOptions, currentUser, json, SESSION_COOKIE } from '@/lib/auth-server';

export async function GET() {
  try {
    const user = await currentUser();
    if (user) return json(user);
    const response = json({ message: '请重新登录' }, 401);
    response.cookies.set(SESSION_COOKIE, '', cookieOptions(0));
    return response;
  } catch {
    return json({ message: '暂时无法验证登录状态，请稍后重试' }, 502);
  }
}
