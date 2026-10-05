'use client';

import { useState } from 'react';
import { Alert, Box, Button, Chip, Container, Paper, Stack, Typography } from '@mui/material';

export default function Home() {
  const [count, setCount] = useState(0);

  return (
    <Container maxWidth="md" component="main" sx={{ py: { xs: 5, md: 10 } }}>
      <Typography variant="overline" color="primary">AGENT DEVELOPMENT</Typography>
      <Typography variant="h3" component="h1" sx={{ fontWeight: 700, mt: 1, mb: 2 }}>
        前端开发环境已就绪
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        这是项目的第一个页面。点击按钮，检查 React 交互和 MUI 组件是否正常。
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        <Chip label="Next.js · App Router" />
        <Chip label="MUI v6" color="primary" />
        <Chip label="TypeScript" />
      </Stack>
      <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 } }}>
        <Typography variant="h5" component="h2" gutterBottom>交互测试</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>每次点击都会更新下方计数。</Typography>
        <Button variant="contained" size="large" onClick={() => setCount((value) => value + 1)}>
          测试 MUI 按钮
        </Button>
        <Box role="status" aria-live="polite" sx={{ my: 3 }}>
          已点击 {count} 次
        </Box>
        {count > 0 && <Alert severity="success">交互成功，前端组件运行正常。</Alert>}
      </Paper>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
        当前页面仅验证前端环境，尚未连接后端、数据库或模型 API。
      </Typography>
    </Container>
  );
}
