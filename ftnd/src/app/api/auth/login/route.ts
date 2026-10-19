import { submitCredentials } from '@/lib/auth-server';

export async function POST(request: Request) {
  return submitCredentials(request, 'login');
}
