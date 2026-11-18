import { Alert, Typography } from '@mui/material';
import type { ChatMessage } from '../types';
import TextMessageView from './text-message';

/** 根据消息类型选择组件；未实现的业务类型只显示说明。 */
export default function MessageRenderer({ message }: { message: ChatMessage }) {
  switch (message.type) {
    case 'tool-error': return <Alert severity="error">{message.content.message}</Alert>;
    case 'text': return <TextMessageView message={message} />;
    case 'table':
    case 'chart':
    case 'report': {
      const { title, summary } = message.content;
      if (summary) return <Typography variant="body2">{title} · {summary}</Typography>;
      const kinds = { table: '表格', chart: '图表', report: '报表' };
      return <Placeholder kind={kinds[message.type]} title={title} />;
    }
    case 'confirmation': return <Placeholder kind="人工确认" title={message.content.title} />;
    case 'unsupported': return <Alert severity="info">{message.content.reason}</Alert>;
  }
}

function Placeholder({ kind, title }: { kind: string; title: string | null }) {
  return <Alert severity="info"><Typography variant="body2">{title || kind}：{kind}消息展示功能尚未实现。</Typography></Alert>;
}
