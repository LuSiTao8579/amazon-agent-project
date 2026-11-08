'use client';

import { useEffect, useRef, useState } from 'react';
import { ButtonBase, Paper, Stack, Typography } from '@mui/material';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import ChatWindow from './chat-window';

/** 入口挂在共享工作台中，普通页面切换不会重新创建聊天窗口状态。 */
export default function ChatLauncher() {
  const [open, setOpen] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const hasOpened = useRef(false);

  useEffect(() => {
    // 等入口重新显示后再恢复焦点；不能在按钮仍被隐藏时调用focus。
    if (!open && hasOpened.current) launcher.current?.focus();
  }, [open]);

  function close() {
    setOpen(false);
  }

  return <>
    <Paper elevation={6} sx={{ position: 'fixed', right: { xs: 16, sm: 24 }, bottom: { xs: 16, sm: 24 },
      width: { xs: 'calc(100vw - 32px)', sm: 300 }, zIndex: (theme) => theme.zIndex.modal + 1,
      borderRadius: 4, overflow: 'hidden', display: open ? 'none' : 'block' }}>
      <ButtonBase ref={launcher} onClick={() => { hasOpened.current = true; setOpen(true); }} aria-label="打开 AI 助手"
        aria-haspopup="dialog" aria-expanded={open} sx={{ width: '100%', textAlign: 'left', p: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: '100%' }}>
          <ChatBubbleOutlineRoundedIcon color="primary" />
          <div><Typography fontWeight={700}>AI 助手</Typography>
            <Typography variant="body2" color="text.secondary">点击打开聊天窗口</Typography></div>
        </Stack>
      </ButtonBase>
    </Paper>
    {open && <ChatWindow onClose={close} />}
  </>;
}
