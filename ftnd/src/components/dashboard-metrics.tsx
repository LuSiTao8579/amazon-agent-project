import { Box, Paper, Typography } from '@mui/material';
import type { Dashboard } from '../../../contracts/tool-result.d.ts';

const numberFormat = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export function compact(value: number) { return numberFormat.format(value); }

export default function DashboardMetrics({ summary }: { summary: Dashboard['summary'] }) {
  const cards = [
    ['公司数量', summary.companyCount, '家公司'],
    ['总收入', summary.totalRevenue, '原始数据单位'],
    ['覆盖国家', summary.countryCount, '个国家'],
    ['员工数量', summary.employeeCount, '名员工'],
  ] as const;
  return <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))', gap: 2 }}>
    {cards.map(([title, value, unit]) => <Paper key={title} variant="outlined" sx={{ p: 3, minWidth: 0 }}>
      <Typography color="text.secondary">{title}</Typography>
      <Typography variant="h4" sx={{ my: 1, fontVariantNumeric: 'tabular-nums' }} title={value.toLocaleString()}>
        {compact(value)}
      </Typography>
      <Typography variant="body2">{unit}</Typography>
    </Paper>)}
  </Box>;
}
