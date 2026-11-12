import { Alert, Typography } from '@mui/material';
import type { ChatMessage } from '../types';
import TextMessageView from './text-message';

/** 根据消息类型选择组件；未实现的业务类型只显示说明。 */
export default function MessageRenderer({ message }: { message: ChatMessage }) {
  switch (message.type) {
    case 'text': return <TextMessageView message={message} />;
    case 'table': return <Placeholder kind="表格" title={message.content.title} />;
    case 'chart': return <Placeholder kind="图表" title={message.content.title} />;
    case 'report': return <Placeholder kind="报表" title={message.content.title} />;
    case 'confirmation': return <Placeholder kind="人工确认" title={message.content.title} />;
    case 'unsupported': return <Alert severity="info">{message.content.reason}</Alert>;
  }
}

function Placeholder({ kind, title }: { kind: string; title: string | null }) {
  return <Alert severity="info"><Typography variant="body2">{title || kind}：{kind}消息展示功能尚未实现。</Typography></Alert>;
}
