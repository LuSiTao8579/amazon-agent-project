import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import { workspaceSections, type WorkspaceSection } from '@/config/routes';
import type { PublicUser } from '@/lib/auth-contract';

export default function WorkspacePageContent({
  section,
  user,
}: {
  section: WorkspaceSection;
  user: PublicUser;
}) {
  const current = workspaceSections[section];

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 } }}>
        <Chip
          label="共享导航布局 · 页面框架占位"
          size="small"
          variant="outlined"
          sx={{ mb: 3 }}
        />
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
          {current.title}
        </Typography>
        <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
          {current.subtitle}
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 680 }}>
          {current.description}
        </Typography>
        {section === 'user' && (
          <Stack
            spacing={0.5}
            sx={{ mt: 3, pt: 3, borderTop: 1, borderColor: 'divider' }}
          >
            <Typography variant="subtitle2" color="text.secondary">
              当前已验证账户（来自 GET /auth/me）
            </Typography>
            <Typography variant="body1" sx={{ overflowWrap: 'anywhere' }}>
              登录邮箱：{user.email}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
              用户 ID：{user.id}
            </Typography>
          </Stack>
        )}
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap: 2,
        }}
      >
        {current.placeholders.map((item) => (
          <Paper key={item.title} variant="outlined" sx={{ p: 3 }}>
            <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, mb: 1 }}>
              {item.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {item.summary}
            </Typography>
          </Paper>
        ))}
      </Box>
    </Stack>
  );
}
