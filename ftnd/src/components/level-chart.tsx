'use client';
import { ArcElement, Chart as ChartJS, Legend, Tooltip } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { Box, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import type { DashboardData } from './dashboard';
ChartJS.register(ArcElement, Tooltip, Legend);
const colors=['#155e75','#f59e0b','#10b981','#6366f1','#ec4899','#8b5cf6','#0ea5e9','#f97316'];

export default function LevelChart({rows}:{rows:DashboardData['levelDistribution']}) {
  return <Paper variant="outlined" sx={{p:3}}>
    <Typography variant="h6">供应公司等级分布</Typography>
    <Typography variant="body2" color="text.secondary">鼠标悬停查看数量和占比；完整数据见下表。</Typography>
    {rows.length ? <>
      <Box sx={{height:260,mt:2}}>
        <Doughnut aria-label="公司等级占比环形图" role="img"
          data={{labels:rows.map(r=>`Level ${r.level}`),datasets:[{data:rows.map(r=>r.count),backgroundColor:rows.map((_,i)=>colors[i%colors.length])}]}}
          options={{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:ctx=>{const row=rows[ctx.dataIndex];return `Level ${row.level}: ${row.count.toLocaleString()} 家（${row.percentage.toFixed(2)}%）`;}}}}}}/>
      </Box>
      <Table size="small" aria-label="公司等级分布数据"><TableHead><TableRow><TableCell>等级</TableCell><TableCell align="right">数量</TableCell><TableCell align="right">占比</TableCell></TableRow></TableHead><TableBody>
        {rows.map(row=><TableRow key={row.level}><TableCell>Level {row.level}</TableCell><TableCell align="right">{row.count.toLocaleString()}</TableCell><TableCell align="right">{row.percentage.toFixed(2)}%</TableCell></TableRow>)}
      </TableBody></Table>
    </>:<Typography sx={{py:4}}>暂无公司数据</Typography>}
  </Paper>;
}
