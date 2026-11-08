import { Alert, Box, Stack, Typography } from '@mui/material';
import type { ChatMessage } from '../types';
import MessageRenderer from './message-renderer';

export default function MessageList({ messages, hasMore }: { messages: ChatMessage[]; hasMore: boolean }) {
  return <Stack spacing={1.5}>
    {messages.map(message => <Box key={message.id} sx={{ alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
      bgcolor: message.role === 'user' ? 'primary.main' : 'background.paper', color: message.role === 'user' ? 'primary.contrastText' : 'text.primary',
      borderRadius: 2, px: 2, py: 1.5, maxWidth: '88%', minWidth: 0, overflowWrap: 'anywhere' }}>
      <Typography variant="caption">{message.role === 'user' ? '我' : 'AI 助手'}</Typography>
      <MessageRenderer message={message} />
      {message.turnStatus === 'failed' && <Typography variant="caption">回复未完成</Typography>}
      {message.turnStatus === 'pending' && <Typography variant="caption">回复处理中</Typography>}
    </Box>)}
    {hasMore && <Alert severity="info">当前显示前 1000 条消息，更多历史将在后续支持。</Alert>}
  </Stack>;
}
