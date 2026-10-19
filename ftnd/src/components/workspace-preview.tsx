'use client';

import NextLink from 'next/link';
import {
  Alert, Box, Button, Chip, Container, Paper, Stack, Typography,
} from '@mui/material';
import { workspaceSections, type WorkspaceSection } from '@/config/routes';
import type { PublicUser } from '@/lib/auth-contract';
import LogoutButton from './logout-button';

export default function WorkspacePreview({ section, user }: { section: WorkspaceSection; user: PublicUser }) {
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
        <LogoutButton />
      </Stack>

      <Alert severity="success" sx={{ mb: 3, overflowWrap: 'anywhere' }}>
        已登录：{user.email}
      </Alert>

      <Box
        component="nav"
        aria-label="工作台导航"
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
          注册登录已接入真实账号；当前业务页面仍为框架，图表、公司与订单功能将在后续步骤完成。
        </Typography>
      </Paper>
    </Container>
  );
}
