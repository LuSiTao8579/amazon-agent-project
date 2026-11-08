import { useRef } from 'react';
import { Box, Button, IconButton, Stack, TextField, Typography } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { ATTACHMENT_ACCEPT } from '../upload-policy';

type Props = { text: string; onText: (text:string)=>void; onSend: ()=>void; onFile: (file:File)=>void; busy:boolean; disabled:boolean };
export default function ChatInput({ text, onText, onSend, onFile, busy, disabled }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  return <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
    <Typography variant="caption" color="text.secondary">支持 TXT、MD、CSV、TSV、PDF、DOCX、XLSX，单个文件不超过 5 MB。附件保存后暂不会交给模型分析。</Typography>
    <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ mt: 1 }}>
      <input ref={fileInput} type="file" hidden accept={ATTACHMENT_ACCEPT} onChange={e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (file) onFile(file);
      }} />
      <IconButton aria-label="上传附件" disabled={disabled || busy} onClick={() => fileInput.current?.click()}><AttachFileIcon /></IconButton>
      <TextField fullWidth multiline minRows={1} maxRows={4} size="small" label="输入消息" value={text} disabled={disabled || busy}
        onChange={e => onText(e.target.value)} slotProps={{ htmlInput: { maxLength: 8000 } }}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!disabled && !busy && text.trim()) onSend(); }
        }} />
      <Button aria-label="发送消息" variant="contained" disabled={disabled || busy || !text.trim()} onClick={onSend} sx={{ minWidth: 44, height: 40 }}><SendRoundedIcon /></Button>
    </Stack>
    <Typography variant="caption" color="text.secondary">Enter 发送 · Shift + Enter 换行{busy ? ' · 正在处理…' : ''}</Typography>
  </Box>;
}
