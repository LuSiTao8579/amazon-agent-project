'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { errorMessage } from '@/lib/auth-contract';
import LevelChart from './level-chart';

export type DashboardData = { summary: { companyCount:number; totalRevenue:number; countryCount:number; employeeCount:number };
  levelDistribution: {level:number;count:number;percentage:number}[];
  yearlyGrowth: {year:number;newCompanies:number;cumulativeCompanies:number}[] };
export function compact(value:number) { return new Intl.NumberFormat('en', {notation:'compact',maximumFractionDigits:1}).format(value); }

export default function Dashboard() {
  const [data,setData] = useState<DashboardData|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const router = useRouter();
  const load = useCallback(async (signal?:AbortSignal) => {
    setLoading(true);setError('');
    try {
      const response = await fetch('/api/manage/dashboard',{cache:'no-store',signal});
      const body = await response.json();
      if(response.status===401){router.replace('/login');return;}
      if(!response.ok) throw new Error(errorMessage(body,'读取数据失败'));
      if(!signal?.aborted)setData(body);
    } catch(e) {if(!signal?.aborted)setError(e instanceof Error?e.message:'读取数据失败');}
    finally {if(!signal?.aborted)setLoading(false);}
  },[router]);
  useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>void load(controller.signal),0);return ()=>{clearTimeout(timer);controller.abort();};},[load]);
  const cards = data ? [
    ['公司数量',data.summary.companyCount,'家公司'],
    ['总收入',data.summary.totalRevenue,'原始数据单位'],
    ['覆盖国家',data.summary.countryCount,'个国家'],
    ['员工数量',data.summary.employeeCount,'名员工'],
  ] as const : [];
  return <Stack spacing={3}>
    <Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography component="h1" variant="h4">Dashboard</Typography><Typography component="h2" variant="subtitle1" color="text.secondary">数据总览</Typography></Box><Button onClick={()=>void load()} disabled={loading}>刷新数据</Button></Stack>
    <Typography color="text.secondary">基于全部公司资料统计；修改公司后可点击刷新数据。</Typography>
    {error && <Alert severity="error" action={<Button color="inherit" onClick={()=>void load()}>重试</Button>}>{error}</Alert>}
    {loading && <CircularProgress aria-label="加载数据"/>}
    {data && <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2, 1fr)',lg:'repeat(4, 1fr)'},gap:2}}>
      {cards.map(([title,value,unit])=><Paper key={title} variant="outlined" sx={{p:3}}><Typography color="text.secondary">{title}</Typography><Typography variant="h4" sx={{my:1}} title={value.toLocaleString()}>{compact(value)}</Typography><Typography variant="body2">{unit}</Typography></Paper>)}
    </Box>}
    {data && <LevelChart rows={data.levelDistribution}/>}
  </Stack>;
}
