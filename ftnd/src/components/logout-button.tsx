'use client';

import { useRef, useState } from 'react';
import { Alert, Button, Stack } from '@mui/material';
import { routes } from '@/config/routes';

export default function LogoutButton() {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function logout() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error('Logout failed');
      window.location.replace(routes.login);
    } catch {
      setFailed(true);
      busy.current = false;
      setPending(false);
    }
  }
  return <Stack spacing={1}>
    <Button variant="outlined" onClick={logout} disabled={pending}>
      {pending ? '正在退出…' : '退出登录'}
    </Button>
    {failed && <Alert severity="error">退出失败，请重试。</Alert>}
  </Stack>;
}
