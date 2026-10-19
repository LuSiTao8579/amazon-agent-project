'use client';

import { useRef, useState, type FormEvent } from 'react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import {
  Alert, Box, Button, CircularProgress, Container, IconButton, InputAdornment,
  Link, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { routes, workspaceNavItems } from '@/config/routes';
import { errorMessage, isRecord, isPublicUser, type AuthMode, type FieldErrors } from '@/lib/auth-contract';
import { normalizeEmail, validateCredentials } from '@/lib/auth-validation';
import { useRegistrationFeedback } from './registration-feedback';

export default function AuthForm({ mode }: { mode: AuthMode }) {
  const isSignup = mode === 'signup';
  const router = useRouter();
  const { notice, setNotice } = useRegistrationFeedback();
  const [email, setEmail] = useState(!isSignup ? notice?.email ?? '' : '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const busy = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const alert = useRef<HTMLDivElement>(null);

  function update(field: 'email' | 'password', value: string) {
    if (field === 'email') setEmail(value);
    else setPassword(value);
    setMessage('');
    // Revalidate a field already showing an error while the user corrects it.
    if (errors[field]) {
      const next = validateCredentials(mode, { email, password, [field]: value });
      setErrors((previous) => ({ ...previous, [field]: next[field] }));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    setMessage('');
    setNotice(null);
    const input = { email: normalizeEmail(email), password };
    const nextErrors = validateCredentials(mode, input);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      (nextErrors.email ? emailInput : passwordInput).current?.focus();
      return;
    }

    busy.current = true;
    setPending(true);
    let navigating = false;
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(15_000),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const fallback = '暂时无法完成请求，请稍后重试';
        setMessage(errorMessage(data, fallback));
        if (response.status === 409) setErrors({ email: '该邮箱已注册，请直接登录或使用其他邮箱' });
        return;
      }
      if (!isRecord(data) || !isPublicUser(data.user)) throw new Error('Invalid response');
      if (isSignup) {
        if (response.status !== 201 || typeof data.message !== 'string') throw new Error('Invalid signup result');
        // This in-memory notice only comes from a successful API response.
        setNotice({ message: data.message, email: data.user.email });
        setPassword('');
        navigating = true;
        router.replace(routes.login);
      } else {
        if (response.status !== 200) throw new Error('Invalid login result');
        setPassword('');
        navigating = true;
        // Reload once so no page data from a previous account survives login.
        window.location.replace(routes.dashboard);
      }
    } catch {
      setMessage(isSignup
        ? '连接中断或请求超时，暂时无法确认注册结果。请重试；若提示邮箱已注册，可前往登录。'
        : '连接失败或请求超时，请检查本地服务后重试。');
    } finally {
      if (!navigating) {
        busy.current = false;
        setPending(false);
        requestAnimationFrame(() => alert.current?.focus());
      }
    }
  }

  return (
    <Container maxWidth="md" component="main" sx={{ py: { xs: 4, md: 8 } }}>
      <Stack spacing={1} sx={{ mb: 4 }}>
        <Typography variant="overline" color="primary">SUPPLY CHAIN WORKSPACE</Typography>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>供应链工作台</Typography>
        <Typography color="text.secondary">让供应链信息与团队协作，从这里连接。</Typography>
      </Stack>
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '0.9fr 1.1fr' } }}>
          <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', p: { xs: 3, md: 4 } }}>
            <Typography variant="overline">CONNECTED OPERATIONS</Typography>
            <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mt: 2, mb: 2 }}>
              {isSignup ? '开启你的工作空间。' : '欢迎回来。'}
            </Typography>
            <Typography sx={{ mb: 4 }}>
              {isSignup ? '使用邮箱创建账号，开始你的供应链管理之旅。' : '登录账号，继续访问你的供应链工作台。'}
            </Typography>
            <Stack spacing={2}>
              {workspaceNavItems.map((item) => (
                <Typography key={item.href}>
                  {item.title} · {item.subtitle}
                </Typography>
              ))}
            </Stack>
          </Box>
          <Box component="form" noValidate onSubmit={submit} aria-busy={pending} sx={{ p: { xs: 3, md: 4 } }}>
            <Stack spacing={3}>
              <Box>
                <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
                  {isSignup ? '创建账号' : '登录工作台'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {isSignup ? '填写邮箱与密码。注册成功后，请使用同一账号登录。' : '请输入你的电子邮箱和密码。'}
                </Typography>
              </Box>
              {!isSignup && notice && <Alert severity="success" role="status">{notice.message}</Alert>}
              {message && <Alert severity="error" ref={alert} tabIndex={-1}>{message}</Alert>}
              <TextField
                id={`${mode}-email`} name="email" label="电子邮箱" type="email"
                fullWidth required autoComplete="username" value={email} inputRef={emailInput}
                disabled={pending} error={Boolean(errors.email)}
                helperText={errors.email || '例如 name@company.com'}
                onChange={(event) => update('email', event.target.value)}
                onBlur={() => setErrors((previous) => ({
                  ...previous, email: validateCredentials(mode, { email, password }).email,
                }))}
                slotProps={{ htmlInput: { autoCapitalize: 'none', spellCheck: false } }}
              />
              <TextField
                id={`${mode}-password`} name="password" label="密码"
                type={showPassword ? 'text' : 'password'} fullWidth required
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={password} inputRef={passwordInput} disabled={pending}
                error={Boolean(errors.password)}
                helperText={errors.password || (isSignup
                  ? '15–128 个字符，支持符号和空格，不能全部为空白。'
                  : '按原样输入密码，区分大小写。')}
                onChange={(event) => update('password', event.target.value)}
                onBlur={() => setErrors((previous) => ({
                  ...previous, password: validateCredentials(mode, { email, password }).password,
                }))}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label={showPassword ? '隐藏密码' : '显示密码'}
                          aria-pressed={showPassword} type="button" edge="end" disabled={pending}
                          onClick={() => setShowPassword((value) => !value)}
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <Button type="submit" variant="contained" size="large" fullWidth disabled={pending}
                startIcon={pending ? <CircularProgress size={18} color="inherit" /> : undefined}>
                {pending ? (isSignup ? '正在注册…' : '正在登录…') : (isSignup ? '注册' : '登录')}
              </Button>
              <Typography variant="body2">
                {isSignup ? '已有账号？' : '还没有账号？'}{' '}
                {pending ? <span>{isSignup ? '前往登录页' : '前往注册页'}</span> : (
                  <Link component={NextLink} href={isSignup ? routes.login : routes.signup}
                    onClick={() => setNotice(null)}>
                    {isSignup ? '前往登录页' : '前往注册页'}
                  </Link>
                )}
              </Typography>
            </Stack>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
}
