import { Alert, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import type { ChatMessage } from '../types';
import CompanyTableMessage from './company-table-message';
import DashboardMetrics from '../../../components/dashboard-metrics';
import GrowthChart from '../../../components/growth-chart';
import LevelChart from '../../../components/level-chart';
import ChatError from './chat-error';
import TextMessageView from './text-message';

function TableMessage({ content }: Extract<ChatMessage, { type: 'table' }>) {
  const { total, page, pageSize, summary, title } = content;
  if (total === 0 || (page - 1) * pageSize >= total)
    return <Typography variant="body2">{title} · {summary}</Typography>;
  if (content.tableType === 'companies')
    return <CompanyTableMessage companies={content.companies} summary={summary} />;
  return <Stack spacing={1}>
    <Typography variant="body2">{summary}</Typography>
    <TableContainer><Table size="small" aria-label="用户查询结果">
      <TableHead><TableRow>{['姓名', '邮箱', '岗位', '状态'].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
      <TableBody>{content.users.map(user => <TableRow key={user.email}>
        <TableCell>{user.name || '未设置'}</TableCell><TableCell>{user.email}</TableCell>
        <TableCell>{user.role}</TableCell><TableCell>{user.status}</TableCell>
      </TableRow>)}</TableBody>
    </Table></TableContainer>
  </Stack>;
}

export default function MessageRenderer({ message }: { message: ChatMessage }) {
  switch (message.type) {
    case 'text': return <TextMessageView message={message} />;
    case 'table': return <TableMessage {...message}/>;
    case 'chart': {
      const chart = message.content.chart;
      return chart.chartType === 'yearlyGrowth' ? <GrowthChart rows={chart.rows}/> : <LevelChart rows={chart.rows}/>;
    }
    case 'report': {
      const { summary, yearlyGrowth, levelDistribution } = message.content.report;
      return <Stack spacing={2}><DashboardMetrics summary={summary}/>
        {levelDistribution && <LevelChart rows={levelDistribution}/>}
        {yearlyGrowth && <GrowthChart rows={yearlyGrowth}/>}
      </Stack>;
    }
    case 'tool-error': return <ChatError>{message.content.message}</ChatError>;
    case 'legacy': {
      const kind = { table: '表格', chart: '图表', report: '报表' }[message.content.kind];
      return <Alert severity="info">{message.content.title || kind} · 这条历史消息缺少可展示的{kind}数据。</Alert>;
    }
    case 'confirmation': return <Alert severity="info">{message.content.title || '人工确认'} · 当前聊天窗口暂不支持处理这条确认消息。</Alert>;
    case 'unsupported': return <Alert severity="info">{message.content.reason}</Alert>;
  }
}
