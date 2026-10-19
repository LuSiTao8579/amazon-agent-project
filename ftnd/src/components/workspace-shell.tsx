'use client';

import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Alert, AppBar, Box, Button, Container, Divider, Stack, Toolbar, Typography,
} from '@mui/material';
import { isActiveWorkspacePath, workspaceNavItems } from '@/config/routes';
import type { PublicUser } from '@/lib/auth-contract';
import LogoutButton from './logout-button';

export default function WorkspaceShell({
  user,
  children,
}: {
  user: PublicUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="static"
        color="inherit"
        elevation={0}
        sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}
      >
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ py: 2 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              spacing={2}
              sx={{ width: '100%' }}
            >
              <Box>
                <Typography variant="overline" color="primary">
                  SUPPLY CHAIN WORKSPACE
                </Typography>
                <Typography variant="h5" component="p" sx={{ fontWeight: 700 }}>
                  供应链工作台
                </Typography>
              </Box>
              <LogoutButton />
            </Stack>
          </Toolbar>
          <Divider />
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', md: 'center' }}
            spacing={2}
            sx={{ py: 2 }}
          >
            <Box
              component="nav"
              aria-label="工作台导航"
              sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}
            >
              {workspaceNavItems.map((item) => {
                const active = isActiveWorkspacePath(pathname, item.href);
                return (
                  <Button
                    key={item.href}
                    component={NextLink}
                    href={item.href}
                    prefetch={false}
                    variant={active ? 'contained' : 'outlined'}
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.title} · {item.subtitle}
                  </Button>
                );
              })}
            </Box>
            <Alert
              severity="success"
              sx={{ py: 0.5, overflowWrap: 'anywhere' }}
            >
              已登录：{user.email}
            </Alert>
          </Stack>
        </Container>
      </AppBar>

      <Container maxWidth="lg" component="main" sx={{ py: { xs: 4, md: 6 } }}>
        {children}
      </Container>
    </Box>
  );
}
