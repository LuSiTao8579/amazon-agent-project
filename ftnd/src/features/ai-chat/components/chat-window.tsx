'use client';

import { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress, IconButton, Paper, Stack, Typography } from '@mui/material';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import type { RecentHistory } from '../types';
import MessageList from './message-list';

type Props = { onClose: () => void };

/** 非模态浮窗：用户仍可切换工作台页面；Escape 和关闭按钮都可以关闭。 */
export default function ChatWindow({ onClose }: Props) {
  const [history, setHistory] = useState<RecentHistory | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    // 关闭窗口时取消请求；再次打开会从后端重新加载，而不是伪造历史。
    fetch('/api/ai-chat/history', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body.message === 'string' ? body.message : '无法加载会话');
        return body as RecentHistory;
      })
      .then(setHistory)
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '无法加载会话'); });
    return () => controller.abort();
  }, []);
  return <Paper component="section" role="dialog" aria-modal="false" aria-labelledby="ai-chat-title"
    onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}
    elevation={12} sx={{
      position: 'fixed', zIndex: (theme) => theme.zIndex.modal + 1,
      right: { xs: 12, sm: 24 }, bottom: { xs: 12, sm: 24 },
      width: { xs: 'calc(100vw - 24px)', sm: 400 },
      height: { xs: 'min(640px, calc(100dvh - 24px))', sm: 'min(640px, calc(100dvh - 48px))' },
      display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 4,
    }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center"
      sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: 'divider' }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 2, bgcolor: 'primary.main', color: 'white' }}>
          <AutoAwesomeRoundedIcon fontSize="small" />
        </Box>
        <Box><Typography id="ai-chat-title" variant="subtitle1" fontWeight={700}>AI 助手</Typography>
          <Typography variant="body2" color="text.secondary">供应链工作台</Typography></Box>
      </Stack>
      <IconButton aria-label="关闭 AI 助手" onClick={onClose} autoFocus><CloseRoundedIcon /></IconButton>
    </Stack>
    <Box aria-live="polite" sx={{ flex: 1, overflowY: 'auto', p: 2.5, bgcolor: 'background.default' }}>
      {error ? <Alert severity="error">{error}</Alert> : !history ?
        <Stack alignItems="center" sx={{ py: 5 }}><CircularProgress size={24} aria-label="加载会话" /></Stack> :
        !history.session || history.messages.length === 0 ?
          <Stack spacing={1.5} alignItems="center" justifyContent="center" sx={{ height: '100%', textAlign: 'center' }}>
            <ChatBubbleOutlineRoundedIcon color="primary" sx={{ fontSize: 38 }} />
            <Typography variant="h6">你好，有什么可以帮你？</Typography>
            <Typography variant="body2" color="text.secondary">暂无消息，聊天功能正在准备中。</Typography>
          </Stack> :
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">最近会话：{history.session.title}</Typography>
            <MessageList messages={history.messages} hasMore={history.hasMore} />
          </Stack>}
    </Box>
    <Typography variant="caption" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>消息输入功能正在准备中</Typography>
  </Paper>;
}
