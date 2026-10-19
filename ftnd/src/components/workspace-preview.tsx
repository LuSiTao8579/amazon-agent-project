'use client';

import NextLink from 'next/link';
import {
  Alert, Box, Button, Chip, Container, Paper, Stack, Typography,
} from '@mui/material';
import { routes, workspaceSections, type WorkspaceSection } from '@/config/routes';

export default function WorkspacePreview({ section }: { section: WorkspaceSection }) {
  const current = workspaceSections[section];

  return (
    <Container maxWidth="lg" component="main" sx={{ py: { xs: 4, md: 7 } }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
        sx={{ mb: 4 }}
      >
        <Box>
          <Typography variant="overline" color="primary">SUPPLY CHAIN WORKSPACE</Typography>
          <Typography variant="h5" component="p" sx={{ fontWeight: 700 }}>供应链工作台</Typography>
        </Box>
        <Button component={NextLink} href={routes.login} variant="outlined">返回登录页</Button>
      </Stack>

      <Alert severity="warning" sx={{ mb: 3 }}>
        页面框架预览：当前没有登录状态或访问保护，也不展示真实业务数据。
      </Alert>

      <Box
        component="nav"
        aria-label="页面框架预览导航"
        sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}
      >
        {Object.values(workspaceSections).map((item) => (
          <Button
            key={item.href}
            component={NextLink}
            href={item.href}
            variant={item.href === current.href ? 'contained' : 'outlined'}
            aria-current={item.href === current.href ? 'page' : undefined}
          >
            {item.title}
          </Button>
        ))}
      </Box>

      <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 } }}>
        <Chip label="路由已建立 · 业务待实现" size="small" variant="outlined" sx={{ mb: 3 }} />
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
          {current.title}
        </Typography>
        <Typography variant="h6" component="h2" sx={{ mb: 2 }}>{current.subtitle}</Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 640 }}>{current.description}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 4 }}>
          当前仅用于核对页面入口；正式共享导航、鉴权和业务内容将在后续步骤完成。
        </Typography>
      </Paper>
    </Container>
  );
}
