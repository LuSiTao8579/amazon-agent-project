'use client';

import NextLink from 'next/link';
import {
  Alert, Box, Button, Chip, Container, Divider, Link,
  Paper, Stack, TextField, Typography,
} from '@mui/material';
import { routes } from '@/config/routes';

export default function AuthPreview({ mode }: { mode: 'signup' | 'login' }) {
  const isSignup = mode === 'signup';
  const title = isSignup ? '创建账号' : '登录工作台';

  return (
    <Container maxWidth="md" component="main" sx={{ py: { xs: 4, md: 9 } }}>
      <Stack spacing={1} sx={{ mb: 4 }}>
        <Typography variant="overline" color="primary">SUPPLY CHAIN WORKSPACE</Typography>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          供应链工作台
        </Typography>
        <Typography color="text.secondary">从账号入口开始，连接后续业务。</Typography>
      </Stack>

      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '0.9fr 1.1fr' } }}>
          <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', p: { xs: 3, md: 4 } }}>
            <Typography variant="overline">第一步 · 页面框架</Typography>
            <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mt: 2, mb: 2 }}>
              先确定入口，再连接业务。
            </Typography>
            <Typography sx={{ mb: 4 }}>
              本次先确定邮箱、密码两个字段，以及注册后登录、登录后进入 Dashboard 的流程。
            </Typography>
            <Stack spacing={2}>
              <Typography>01 · 注册成功后提示结果</Typography>
              <Typography>02 · 进入登录页进行登录</Typography>
              <Typography>03 · 登录成功后进入 Dashboard</Typography>
            </Stack>
            <Typography variant="body2" sx={{ mt: 4 }}>
              以上为后续实现约定，当前不执行认证。
            </Typography>
          </Box>

          <Stack spacing={3} sx={{ p: { xs: 3, md: 4 } }}>
            <Box>
              <Chip size="small" variant="outlined" label="页面原型 · 未接入 API" sx={{ mb: 2 }} />
              <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>{title}</Typography>
            </Box>
            <Alert severity="info">
              当前仅展示页面结构，输入与提交暂未启用；不会创建账号或保存密码。
            </Alert>

            {/* No form or submit handler until the real authentication API exists. */}
            <TextField
              id={isSignup ? 'signup-email' : 'login-email'}
              label="电子邮箱"
              type="email"
              disabled
              fullWidth
              helperText="后续校验空值与邮箱格式"
            />
            <TextField
              id={isSignup ? 'signup-password' : 'login-password'}
              label="密码"
              type="password"
              disabled
              fullWidth
              helperText="具体密码规则将在前后端实现前统一"
            />
            <Button variant="contained" size="large" disabled fullWidth>
              {isSignup ? '注册（接口待接入）' : '登录（接口待接入）'}
            </Button>

            <Typography variant="body2">
              {isSignup ? '已有账号？' : '还没有账号？'}{' '}
              <Link component={NextLink} href={isSignup ? routes.login : routes.signup}>
                {isSignup ? '前往登录页' : '前往注册页'}
              </Link>
            </Typography>
            <Divider />
            <Link component={NextLink} href={routes.dashboard} variant="body2">
              查看 Dashboard 页面框架（非登录）
            </Link>
          </Stack>
        </Box>
      </Paper>
    </Container>
  );
}
