'use client';
import { CategoryScale, Chart as ChartJS, Legend, LineElement, LinearScale, PointElement, Tooltip } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Box, Paper, Typography } from '@mui/material';
import type { DashboardData } from './dashboard';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export default function GrowthChart({rows}:{rows:DashboardData['yearlyGrowth']}) {
  return <Paper variant="outlined" sx={{p:3}}>
    <Typography variant="h6">公司成立年份累计趋势</Typography>
    <Typography variant="body2" color="text.secondary">按公司成立年份累计，并非实际加入供应链的日期。悬停查看当年和累计数量。</Typography>
    {rows.length ? <Box sx={{height:320,mt:2}}>
      <Line aria-label="按成立年份累计公司数量折线图" role="img"
        data={{labels:rows.map(r=>String(r.year)),datasets:[{label:'累计公司数',data:rows.map(r=>r.cumulativeCompanies),borderColor:'#155e75',backgroundColor:'#155e75',pointRadius:2,tension:0.15}]}}
        options={{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true,ticks:{precision:0}}},plugins:{tooltip:{callbacks:{afterLabel:ctx=>`当年新增：${rows[ctx.dataIndex].newCompanies.toLocaleString()} 家`}}}}}/>
    </Box>:<Typography sx={{py:4}}>暂无公司数据</Typography>}
  </Paper>;
}
