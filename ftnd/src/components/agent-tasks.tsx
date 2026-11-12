import {
  Alert, Box, Chip, LinearProgress, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';

// 仅用于页面演示：这些记录不来自任务系统，不会随时间自动更新。
type DemoTask = {
  id: string;
  name: string;
  status: '待处理' | '执行中' | '已完成';
  progress: number;
  createdAt: string;
};
const demoTasks: readonly DemoTask[] = [
  { id: 'demo-1', name: '示例任务 A', status: '待处理', progress: 0, createdAt: '2026-01-01 09:00' },
  { id: 'demo-2', name: '示例任务 B', status: '执行中', progress: 50, createdAt: '2026-01-02 10:30' },
  { id: 'demo-3', name: '示例任务 C', status: '已完成', progress: 100, createdAt: '2026-01-03 14:00' },
];
const statusColor = { 待处理: 'default', 执行中: 'info', 已完成: 'success' } as const;

export default function AgentTasks() {
  // 为右下角聊天入口留出滚动空间，避免遮挡表格最后一行。
  return <Stack spacing={3} sx={{ pb: 10 }}>
    <Box>
      <Typography component="h1" variant="h4">Agent Tasks</Typography>
      <Typography component="h2" variant="subtitle1" color="text.secondary">任务进度</Typography>
    </Box>
    <Alert severity="info">以下为模拟数据，仅用于展示页面样式，不代表真实 Agent 任务或执行进度。</Alert>
    <TableContainer component={Paper} variant="outlined">
      <Table aria-label="Agent 任务进度模拟数据" sx={{ minWidth: 600 }}>
        <TableHead><TableRow>
          <TableCell>任务名称</TableCell><TableCell>状态</TableCell>
          <TableCell>进度</TableCell><TableCell>创建时间（示例）</TableCell>
        </TableRow></TableHead>
        <TableBody>{demoTasks.map(task => <TableRow key={task.id}>
          <TableCell component="th" scope="row">{task.name}</TableCell>
          <TableCell><Chip label={task.status} color={statusColor[task.status]} size="small" /></TableCell>
          <TableCell>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 140 }}>
              <LinearProgress variant="determinate" value={task.progress} aria-label={`${task.name}进度`}
                sx={{ flex: 1, height: 6, borderRadius: 1 }} />
              <Typography variant="body2" sx={{ minWidth: 40 }}>{task.progress}%</Typography>
            </Stack>
          </TableCell>
          <TableCell>{task.createdAt}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </TableContainer>
  </Stack>;
}
