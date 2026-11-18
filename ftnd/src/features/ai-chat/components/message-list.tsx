import { Box, Stack, Typography } from '@mui/material';
import type { ChatMessage } from '../types';
import MessageRenderer from './message-renderer';

export default function MessageList({ messages, sessionId }: { messages: ChatMessage[]; sessionId: string }) {
  return <Stack spacing={1.5}>
    {messages.map(message => <Box key={message.id} sx={{ alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
      bgcolor: message.role === 'user' ? 'primary.main' : 'background.paper', color: message.role === 'user' ? 'primary.contrastText' : 'text.primary',
      borderRadius: 2, px: 2, py: 1.5, maxWidth: '88%', minWidth: 0, overflowWrap: 'anywhere' }}>
      <Typography variant="caption">{message.role === 'user' ? '我' : 'AI 助手'}</Typography>
      <MessageRenderer message={message} />
      {message.attachments?.map(file => <Box key={file.id} sx={{ mt: 1 }}>
        <a href={`/api/ai-chat/sessions/${sessionId}/attachments/${file.id}`} style={{ color: 'inherit' }}>
          {file.name} ({file.size < 1024 ? `${file.size} B` : `${(file.size / 1024).toFixed(1)} KB`})
        </a>
      </Box>)}
      {message.turnStatus === 'failed' && <Typography variant="caption">回复未完成</Typography>}
      {message.turnStatus === 'pending' && <Typography variant="caption">回复处理中</Typography>}
    </Box>)}
  </Stack>;
}
