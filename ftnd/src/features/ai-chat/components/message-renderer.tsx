import { Alert, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import type { ChatMessage } from '../types';
import CompanyTableMessage from './company-table-message';
import DashboardMetrics from '../../../components/dashboard-metrics';
import GrowthChart from '../../../components/growth-chart';
import LevelChart from '../../../components/level-chart';
import TextMessageView from './text-message';

/** 根据消息类型选择组件；未实现的业务类型只显示说明。 */
export default function MessageRenderer({ message }: { message: ChatMessage }) {
  if (message.type === 'table' && message.content.companies) {
    return <CompanyTableMessage companies={message.content.companies} summary={message.content.summary} />;
  }
  if (message.type === 'table' && message.content.users) {
    return <Stack spacing={1}><Typography variant="body2">{message.content.summary}</Typography>
      <TableContainer><Table size="small" aria-label="用户查询结果">
        <TableHead><TableRow>{['姓名', '邮箱', '岗位', '状态'].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
        <TableBody>{message.content.users.map(user => <TableRow key={user.email}>
          <TableCell>{user.name || '未设置'}</TableCell><TableCell>{user.email}</TableCell>
          <TableCell>{user.role}</TableCell><TableCell>{user.status}</TableCell>
        </TableRow>)}</TableBody>
      </Table></TableContainer></Stack>;
  }
  if (message.type === 'chart' && message.content.chart) {
    const chart = message.content.chart;
    return chart.chartType === 'yearlyGrowth' ? <GrowthChart rows={chart.rows}/> : <LevelChart rows={chart.rows}/>;
  }
  if (message.type === 'report' && message.content.report) {
    const { summary, yearlyGrowth, levelDistribution } = message.content.report;
    return <Stack spacing={2}><DashboardMetrics summary={summary}/>
      <LevelChart rows={levelDistribution}/><GrowthChart rows={yearlyGrowth}/></Stack>;
  }
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
