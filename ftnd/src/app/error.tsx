'use client';

import { Alert, Button, Container, Stack } from '@mui/material';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <Container maxWidth="sm" component="main" sx={{ py: 8 }}>
    <Stack spacing={3}>
      <Alert severity="error">暂时无法载入页面，请确认本地后端服务已启动，再重试。</Alert>
      <Button variant="contained" onClick={reset}>重试</Button>
      <Button href="/login">返回登录页</Button>
    </Stack>
  </Container>;
}
